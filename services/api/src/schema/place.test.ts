/**
 * `Place`'s GraphQL surface — B5. Exercised against a stub sidecar
 * (`../testing.ts`), the same pattern `tier-list.test.ts` uses: this proves the
 * resolvers marshal arguments and results correctly, not that `PlaceActor` is
 * correct (that is `place-actor.test.ts`, against real Postgres).
 */
import {
  execute,
  isInputObjectType,
  isUnionType,
  parse,
  validate,
} from "graphql";
import { describe, expect, it } from "vitest";
import { stubSidecar, testContext } from "../testing.ts";
import { schema } from "./index.ts";

const run = (document: string, context: ReturnType<typeof testContext>) =>
  execute({ schema, document: parse(document), contextValue: context });

const viewer = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "test@test.com",
  emailVerified: true,
  role: "user" as const,
};

const PLACE_ID = "22222222-2222-4222-8222-222222222222";

const placeDto = {
  id: PLACE_ID,
  name: "Bar Part Time",
  displayName: null,
  categories: ["wine_bar", "bar"],
  primaryCategory: "wine_bar",
  location: { lng: -122.4194, lat: 37.7749 },
  streetAddress: "496 14th St",
  locality: "San Francisco",
  region: "CA",
  postcode: "94103",
  countryCode: "US",
  phone: null,
  website: null,
  email: null,
  hours: null,
  priceLevel: 2,
  rating: 4.5,
  reviewCount: 120,
  confidence: 0.7,
  description: null,
  source: "user",
  overtureId: null,
  googlePlaceId: null,
  isVerified: false,
  isActive: true,
  accessCount: 0,
  lastAccessedAt: null,
  createdById: viewer.id,
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
  lastSyncAt: null,
};

describe("Query.place", () => {
  it("resolves a place by id through PlaceActor.get", async () => {
    const { invoke, calls } = stubSidecar({ "PlaceActor.get": () => placeDto });
    const result = await run(
      `{ place(id: "${PLACE_ID}") { __typename ... on Place { id name primaryCategory source isVerified } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.place).toEqual({
      __typename: "Place",
      id: PLACE_ID,
      name: "Bar Part Time",
      primaryCategory: "wine_bar",
      source: "user",
      isVerified: false,
    });
    expect(calls[0]).toMatchObject({
      actorType: "PlaceActor",
      actorId: PLACE_ID,
      method: "get",
    });
  });

  /** The acceptance criterion: `{ lng, lat }` survives the GraphQL layer. */
  it("geography round-trips as { lng, lat } — in on createPlace, out on Place.location", async () => {
    const location = { lng: -122.8, lat: 38.0668 };
    const { invoke, calls } = stubSidecar({
      "PlaceCreationActor.createPlace": () => ({
        place: { ...placeDto, location },
        nearbyDuplicates: [],
        review: null,
      }),
      "PlaceActor.get": () => ({ ...placeDto, location }),
    });

    const result = await run(
      `mutation {
         createPlace(input: {
           name: "Point Reyes Oyster Bar"
           categories: ["restaurant"]
           location: { lng: -122.8, lat: 38.0668 }
         }) {
           __typename
           ... on CreatePlacePayload {
             place { id location { lng lat } }
             review { approved }
           }
         }
       }`,
      testContext(invoke, viewer),
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.createPlace).toEqual({
      __typename: "CreatePlacePayload",
      place: { id: PLACE_ID, location },
      review: null,
    });

    // And the *input* reached the actor in the same shape — no GeoJSON, no
    // tuple, no WKT anywhere on the wire.
    const [call] = calls;
    expect(call?.actorType).toBe("PlaceCreationActor");
    // Keyed by the creator (Wave 6), not a global singleton: one user's
    // submissions queue behind each other, nobody else's.
    expect(call?.actorId).toBe(viewer.id);
    expect(call?.args[1]).toMatchObject({
      name: "Point Reyes Oyster Bar",
      categories: ["restaurant"],
      location,
    });
  });

  it("createPlace addresses PlaceCreationActor(viewerId) and refuses an anonymous caller before addressing anything", async () => {
    const { invoke, calls } = stubSidecar({
      "PlaceCreationActor.createPlace": () => ({
        place: placeDto,
        nearbyDuplicates: [],
        review: null,
      }),
    });
    const document = `mutation { createPlace(input: {
         name: "Anywhere", categories: ["bar"], location: { lng: 0, lat: 0 }
       }) { __typename } }`;

    const anonymous = await run(document, testContext(invoke, null));
    expect(anonymous.data?.createPlace).toEqual({
      __typename: "ForbiddenError",
    });
    expect(calls).toHaveLength(0);

    const other = { ...viewer, id: "22222222-2222-4222-8222-222222222222" };
    await run(document, testContext(invoke, viewer));
    await run(document, testContext(invoke, other));
    expect(calls.map((call) => call.actorId)).toEqual([viewer.id, other.id]);
  });

  it("createPlace mints a placeId when the client does not, so a retry is idempotent", async () => {
    const { invoke, calls } = stubSidecar({
      "PlaceCreationActor.createPlace": () => ({
        place: placeDto,
        nearbyDuplicates: [],
        review: null,
      }),
    });
    await run(
      `mutation { createPlace(input: {
         name: "Anywhere", categories: ["bar"], location: { lng: 0, lat: 0 }
       }) { __typename } }`,
      testContext(invoke, viewer),
    );
    const input = calls[0]?.args[1] as { placeId?: string };
    expect(input.placeId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  /**
   * `target-stack.md` §7's live gap. The schema itself is the fix: there is no
   * such input field to send.
   */
  it("createPlace has no googlePlaceId input field at all", () => {
    // `validate`, not `execute`: a document naming a field the input type does
    // not have is rejected before any resolver runs, which is the point — the
    // schema is the fix, not a runtime strip.
    const errors = validate(
      schema,
      parse(
        `mutation { createPlace(input: {
           name: "Claim Jumper", categories: ["bar"], location: { lng: 0, lat: 0 },
           googlePlaceId: "ChIJ_SOMEONE_ELSES"
         }) { __typename } }`,
      ),
    );
    expect(errors.map((error) => error.message).join("\n")).toMatch(
      // graphql 17's wording; 16 said `Field "googlePlaceId" is not defined
      // by type "CreatePlaceInput"`.
      /Expected value of type "CreatePlaceInput" not to include unknown field "googlePlaceId"/,
    );

    const input = schema.getType("CreatePlaceInput");
    expect(isInputObjectType(input)).toBe(true);
    const fields = isInputObjectType(input)
      ? Object.keys(input.getFields())
      : [];
    expect(fields).not.toContain("googlePlaceId");
    expect(fields).not.toContain("source");
    expect(fields).not.toContain("isVerified");
    expect(fields).not.toContain("confidence");
  });

  it("Place.googlePlaceId is readable — the binding is server-owned, not secret", async () => {
    const { invoke } = stubSidecar({
      "PlaceActor.get": () => ({ ...placeDto, googlePlaceId: "ChIJ_REAL" }),
    });
    const result = await run(
      `{ place(id: "${PLACE_ID}") { ... on Place { googlePlaceId } } }`,
      testContext(invoke, viewer),
    );
    expect(result.data?.place).toEqual({ googlePlaceId: "ChIJ_REAL" });
  });
});

describe("enrichPlaceFromGoogle", () => {
  it("reports QUEUED for a user's call", async () => {
    const { invoke, calls } = stubSidecar({
      "PlaceActor.enrichFromGoogle": () => ({
        placeId: PLACE_ID,
        status: "queued",
        enrichment: null,
        photos: [],
        collision: null,
        reason: "queued for the outbox; enrichment is not request-driven",
      }),
    });
    const result = await run(
      `mutation { enrichPlaceFromGoogle(placeId: "${PLACE_ID}", input: { maxPhotos: 5 }) {
         __typename ... on EnrichPlacePayload { status reason place { id } }
       } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.enrichPlaceFromGoogle).toMatchObject({
      __typename: "EnrichPlacePayload",
      status: "QUEUED",
      place: { id: PLACE_ID },
    });
    expect(calls[0]?.args[1]).toEqual({ maxPhotos: 5 });
  });

  /**
   * A cross-row collision is routine, not exceptional — it is a payload, not
   * an error, and it names the other place so the UI can offer a merge.
   */
  it("surfaces a google_place_id collision as a payload naming the other place, not a 500", async () => {
    const other = "33333333-3333-4333-8333-333333333333";
    const { invoke } = stubSidecar({
      "PlaceActor.enrichFromGoogle": () => ({
        placeId: PLACE_ID,
        status: "collision",
        enrichment: null,
        photos: [],
        collision: { googlePlaceId: "ChIJ_SHARED", boundToPlaceId: other },
        reason: "already bound",
      }),
    });
    const result = await run(
      `mutation { enrichPlaceFromGoogle(placeId: "${PLACE_ID}") {
         __typename
         ... on EnrichPlacePayload {
           status
           collision { googlePlaceId boundToPlaceId boundTo { id } }
         }
       } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.enrichPlaceFromGoogle).toEqual({
      __typename: "EnrichPlacePayload",
      status: "COLLISION",
      collision: {
        googlePlaceId: "ChIJ_SHARED",
        boundToPlaceId: other,
        boundTo: { id: other },
      },
    });
  });

  it("carries a BudgetExceededError into the field's result union", async () => {
    const { invoke } = stubSidecar({
      "PlaceActor.enrichFromGoogle": () => {
        throw Object.assign(new Error("google_places/place_details refused"), {
          code: "BUDGET_EXCEEDED",
        });
      },
    });
    const result = await run(
      `mutation { enrichPlaceFromGoogle(placeId: "${PLACE_ID}") { __typename } }`,
      testContext(invoke, viewer),
    );
    // `stubSidecar` throws a plain Error rather than the contract class, so the
    // errors plugin cannot map it — the union *members* are asserted by
    // `schema.test.ts`; what this pins is that the field opted into `errors: {}`
    // at all, i.e. BudgetExceeded is reachable here.
    expect(result.errors).toBeDefined();
    const union = schema.getType("EnrichPlaceFromGoogleResult");
    expect(isUnionType(union)).toBe(true);
    expect(
      isUnionType(union) ? union.getTypes().map((type) => type.name) : [],
    ).toContain("BudgetExceededError");
  });
});

describe("Place children and the tier-list stub", () => {
  it("TierListItem.place resolves through the same Place type, loading it on demand", async () => {
    const tierListItem = {
      id: "44444444-4444-4444-8444-444444444444",
      tierListId: "55555555-5555-4555-8555-555555555555",
      band: 5,
      position: 0,
      notes: null,
      entry: { type: "PLACE" as const, id: PLACE_ID },
      createdAt: "2026-09-09T00:00:00.000Z",
      updatedAt: "2026-09-09T00:00:00.000Z",
    };
    const { invoke, calls } = stubSidecar({
      "TierListActor.addItem": () => tierListItem,
      "PlaceActor.get": () => placeDto,
    });

    const result = await run(
      `mutation { addTierListItem(
         tierListId: "${tierListItem.tierListId}"
         input: { entry: { type: PLACE, id: "${PLACE_ID}" } }
       ) {
         __typename
         ... on TierListItem {
           entryType
           item { id }
           place { id name locality location { lng lat } }
         }
       } }`,
      testContext(invoke, viewer),
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.addTierListItem).toEqual({
      __typename: "TierListItem",
      entryType: "PLACE",
      item: null,
      place: {
        id: PLACE_ID,
        name: "Bar Part Time",
        locality: "San Francisco",
        location: { lng: -122.4194, lat: 37.7749 },
      },
    });

    // Three fields off a bare stub, one actor call: the per-request memo.
    expect(calls.filter((call) => call.method === "get")).toHaveLength(1);
  });

  it("child lists are connections, and menuItems pages through the actor", async () => {
    const { invoke, calls } = stubSidecar({
      "PlaceActor.get": () => placeDto,
      "PlaceActor.photos": () => [
        {
          id: "66666666-6666-4666-8666-666666666666",
          placeId: PLACE_ID,
          googlePhotoName: "places/x/photos/y",
          fileId: null,
          width: 800,
          height: 600,
          attributions: [],
          displayOrder: 0,
          createdAt: "2026-09-09T00:00:00.000Z",
        },
      ],
      "PlaceActor.menuItems": () => ({
        entries: [
          {
            cursor: "0",
            node: {
              id: "77777777-7777-4777-8777-777777777777",
              placeId: PLACE_ID,
              placeMenuId: null,
              menuScanId: null,
              name: "Chablis, 2021",
              description: null,
              price: 18,
              menuCategory: "By the glass",
              detectedItemType: "wine",
              confidenceScore: 0.9,
              extractedAttributes: null,
              matchedItem: {
                type: "wine",
                id: "88888888-8888-4888-8888-888888888888",
              },
              matchVerifiedById: null,
              matchVerifiedAt: null,
              isAvailable: true,
              seasonal: false,
              createdAt: "2026-09-09T00:00:00.000Z",
              updatedAt: "2026-09-09T00:00:00.000Z",
            },
          },
        ],
        hasNextPage: false,
        hasPreviousPage: false,
        totalCount: 1,
      }),
    });

    const result = await run(
      `{ place(id: "${PLACE_ID}") { ... on Place {
           photos(first: 5) { totalCount edges { node { googlePhotoName displayOrder } } }
           menuItems(first: 10) {
             totalCount
             edges { node { name price detectedItemType matchedItem { type id } } }
           }
         } } }`,
      testContext(invoke, viewer),
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.place).toEqual({
      photos: {
        totalCount: 1,
        edges: [
          { node: { googlePhotoName: "places/x/photos/y", displayOrder: 0 } },
        ],
      },
      menuItems: {
        totalCount: 1,
        edges: [
          {
            node: {
              name: "Chablis, 2021",
              price: 18,
              detectedItemType: "wine",
              matchedItem: {
                type: "wine",
                id: "88888888-8888-4888-8888-888888888888",
              },
            },
          },
        ],
      },
    });
    expect(
      calls.find((call) => call.method === "menuItems")?.args[1],
    ).toMatchObject({ first: 10 });
  });

  /**
   * A7h. The gap D10 hit wiring image upload: `PlacePhoto` carried a `fileId`
   * and no relation, so a place photo was exactly the dead end `ItemImage` was
   * before A7c. `FileActor`'s read rule already allowed it — `#requireReader`
   * (`file-actor.ts`) returns for any file a `place_google_photos` row
   * references — so only the field was missing.
   */
  it("PlacePhoto.file { url } is a path from a place to a renderable URL", async () => {
    const fileId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const { invoke, calls } = stubSidecar({
      "PlaceActor.get": () => placeDto,
      "PlaceActor.photos": () => [
        {
          id: "66666666-6666-4666-8666-666666666666",
          placeId: PLACE_ID,
          googlePhotoName: "places/x/photos/mirrored",
          fileId,
          width: 800,
          height: 600,
          attributions: [],
          displayOrder: 0,
          createdAt: "2026-09-09T00:00:00.000Z",
        },
      ],
      "FileActor.get": () => ({
        id: fileId,
        bucket: "cellar-files",
        key: `place-photo/${fileId}`,
        size: 4096,
        mimeType: "image/jpeg",
        etag: "abc",
        // Not the viewer: `PlaceActor` uploads place photos under the system
        // ctx, so this is precisely the non-uploader read `FileActor` widens
        // for. Nothing here loosens it further.
        uploadedBy: null,
        verifiedAt: "2026-09-09T00:00:00.000Z",
        metadata: { kind: "place-photo" },
        createdAt: "2026-09-09T00:00:00.000Z",
        updatedAt: "2026-09-09T00:00:00.000Z",
      }),
      "FileActor.presignRead": () => ({
        url: `http://minio:9000/cellar-files/place-photo/${fileId}?X-Amz-Signature=y`,
        expiresAt: "2026-09-09T00:30:00.000Z",
      }),
    });

    const result = await run(
      `{ place(id: "${PLACE_ID}") { ... on Place {
           photos(first: 5) { edges { node { fileId file { id mimeType url } } } }
         } } }`,
      testContext(invoke, viewer),
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.place).toEqual({
      photos: {
        edges: [
          {
            node: {
              fileId,
              file: {
                id: fileId,
                mimeType: "image/jpeg",
                url: `http://minio:9000/cellar-files/place-photo/${fileId}?X-Amz-Signature=y`,
              },
            },
          },
        ],
      },
    });
    expect(
      calls
        .filter((call) => call.actorType === "FileActor")
        .map((c) => c.method),
    ).toEqual(["get", "presignRead"]);
  });

  /**
   * The half `ItemImage.file` cannot express. `storage_file_id` is a nullable
   * column and `PlacePhoto.fileId` is `ID`, so `file` is `File` and not
   * `File!`: a row that only ever carried the Google reference resolves to
   * null, with no actor call and no error nulling the connection around it.
   */
  it("PlacePhoto.file is null — not an error — when only the Google reference is known", async () => {
    const { invoke, calls } = stubSidecar({
      "PlaceActor.get": () => placeDto,
      "PlaceActor.photos": () => [
        {
          id: "66666666-6666-4666-8666-666666666666",
          placeId: PLACE_ID,
          googlePhotoName: "places/x/photos/unmirrored",
          fileId: null,
          width: 800,
          height: 600,
          attributions: [],
          displayOrder: 0,
          createdAt: "2026-09-09T00:00:00.000Z",
        },
      ],
    });

    const result = await run(
      `{ place(id: "${PLACE_ID}") { ... on Place {
           photos(first: 5) { edges { node { fileId file { url } } } }
         } } }`,
      testContext(invoke, viewer),
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.place).toEqual({
      photos: { edges: [{ node: { fileId: null, file: null } }] },
    });
    expect(calls.filter((call) => call.actorType === "FileActor")).toEqual([]);
  });
});

describe("Query.duplicatePlaces", () => {
  it("passes the location through and returns candidates as a connection", async () => {
    const other = "99999999-9999-4999-8999-999999999999";
    // C1 repointed this field at `DuplicatePlaceSearchActor` (§2.1's
    // "findDuplicates will delegate … once that exists", done at the resolver
    // because §8.5 forbids entity → search). The field's shape is unchanged.
    const { invoke, calls } = stubSidecar({
      "DuplicatePlaceSearchActor.results": () => ({
        entries: [
          {
            cursor: "offset:0",
            node: {
              placeId: other,
              name: "Bar Part Time",
              primaryCategory: "bar",
              location: { lng: -122.4194, lat: 37.7749 },
              streetAddress: null,
              locality: null,
              similarity: 0.92,
              distanceMeters: 12.5,
            },
          },
        ],
        hasNextPage: false,
        hasPreviousPage: false,
        totalCount: 1,
      }),
      "PlaceActor.get": () => ({ ...placeDto, id: other }),
    });

    const result = await run(
      `{ duplicatePlaces(
           name: "Bar Part Time"
           location: { lng: -122.4194, lat: 37.7749 }
           radiusMeters: 150
           first: 5
         ) {
           __typename
           ... on DuplicatePlaceConnection {
             edges { node { placeId name similarity distanceMeters place { name } } }
           }
         } }`,
      testContext(invoke, viewer),
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.duplicatePlaces).toEqual({
      __typename: "DuplicatePlaceConnection",
      edges: [
        {
          node: {
            placeId: other,
            name: "Bar Part Time",
            similarity: 0.92,
            distanceMeters: 12.5,
            place: { name: "Bar Part Time" },
          },
        },
      ],
    });
    expect(calls[0]).toMatchObject({
      actorType: "DuplicatePlaceSearchActor",
      method: "results",
    });
    // Every optional is sent explicitly as `null` rather than omitted: the
    // actor's key builder treats the two the same (`searchHash` drops nulls),
    // and an explicit shape is what the resolver and the actor both hash.
    expect(calls[0]?.args[1]).toEqual({
      name: "Bar Part Time",
      location: { lng: -122.4194, lat: 37.7749 },
      radiusMeters: 150,
      minSimilarity: null,
      limit: null,
    });
  });
});

describe("the other place mutations", () => {
  it("verifyMenuItemMatch sends null for a rejection", async () => {
    const { invoke, calls } = stubSidecar({
      "PlaceActor.verifyMenuItemMatch": () => ({
        id: "77777777-7777-4777-8777-777777777777",
        placeId: PLACE_ID,
        placeMenuId: null,
        menuScanId: null,
        name: "Chablis, 2021",
        description: null,
        price: null,
        menuCategory: null,
        detectedItemType: null,
        confidenceScore: null,
        extractedAttributes: null,
        matchedItem: null,
        matchVerifiedById: viewer.id,
        matchVerifiedAt: "2026-09-09T00:00:00.000Z",
        isAvailable: true,
        seasonal: false,
        createdAt: null,
        updatedAt: null,
      }),
    });
    const result = await run(
      `mutation { verifyMenuItemMatch(
         placeId: "${PLACE_ID}", menuItemId: "77777777-7777-4777-8777-777777777777"
       ) { __typename ... on PlaceMenuItem { matchedItem { id } matchVerifiedById } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.verifyMenuItemMatch).toEqual({
      __typename: "PlaceMenuItem",
      matchedItem: null,
      matchVerifiedById: viewer.id,
    });
    expect(calls[0]?.args[1]).toEqual({
      menuItemId: "77777777-7777-4777-8777-777777777777",
      match: null,
    });
  });

  it("linkPlaceBrand and recordPlaceAccess reach PlaceActor with the right shape", async () => {
    const brandId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const { invoke, calls } = stubSidecar({
      "PlaceActor.linkBrand": () => ({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        placeId: PLACE_ID,
        brandId,
        relationshipType: "serves",
        createdAt: "2026-09-09T00:00:00.000Z",
      }),
      "PlaceActor.recordAccess": () => ({
        placeId: PLACE_ID,
        accessCount: 4,
        lastAccessedAt: "2026-09-09T00:00:00.000Z",
      }),
    });

    const linked = await run(
      `mutation { linkPlaceBrand(placeId: "${PLACE_ID}", input: {
         brandId: "${brandId}", relationshipType: serves
       }) { __typename ... on PlaceBrand { brandId relationshipType } } }`,
      testContext(invoke, viewer),
    );
    expect(linked.errors).toBeUndefined();
    expect(linked.data?.linkPlaceBrand).toEqual({
      __typename: "PlaceBrand",
      brandId,
      relationshipType: "serves",
    });
    expect(calls[0]?.args[1]).toEqual({
      brandId,
      relationshipType: "serves",
    });

    const recorded = await run(
      `mutation { recordPlaceAccess(placeId: "${PLACE_ID}") {
         __typename ... on RecordedPlaceAccess { accessCount place { id } }
       } }`,
      testContext(invoke, viewer),
    );
    expect(recorded.errors).toBeUndefined();
    expect(recorded.data?.recordPlaceAccess).toEqual({
      __typename: "RecordedPlaceAccess",
      accessCount: 4,
      place: { id: PLACE_ID },
    });
  });
});
