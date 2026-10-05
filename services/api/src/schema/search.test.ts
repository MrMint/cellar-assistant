/**
 * The C1 search fields, executed against a stub sidecar.
 *
 * The actors' own suites prove the behaviour against real Postgres. What lives
 * here is the half that only exists in `services/api`:
 *
 *  - **the actor id a resolver computes is the one its key builder produces**,
 *    for all ten fields. A resolver that hashed anything else would be refused
 *    by the actor at runtime, so this is the test that turns that runtime
 *    refusal into a compile-time-ish guarantee;
 *  - **pagination never reaches the key** — `first`/`after` change the page and
 *    not the activation, which is the whole of §1.5's caching claim seen from
 *    the client's side;
 *  - **the viewer changes the key for exactly three surfaces** and no others.
 */
import type { Ctx } from "@cellar-assistant/contracts";
import {
  brandSearchActorId,
  ConflictError,
  cellarItemSearchActorId,
  duplicatePlaceSearchActorId,
  geocodeActorId,
  googlePlacesActorId,
  itemSearchActorId,
  placeSearchActorId,
  recipeSearchActorId,
  userSearchActorId,
} from "@cellar-assistant/contracts";
import { execute, parse, validate } from "graphql";
import { describe, expect, it } from "vitest";
import { ActorInvocationError } from "../dapr.ts";
import { stubSidecar, testContext } from "../testing.ts";
import { schema } from "./index.ts";

/**
 * Validates before executing — A7c's rule, and A7e is why it is here too.
 *
 * `execute` on its own is **lenient about abstract types**: it resolves the
 * runtime type first and then collects fields against *that*, so
 * `{ itemSearch { edges } }` still returned data after `itemSearch` became a
 * union, while Yoga — which validates — would reject the document outright.
 * Every assertion in this file stayed green through the reshape without this
 * call, which is exactly the silent-staleness this workstream exists to remove.
 */
const run = (document: string, context: ReturnType<typeof testContext>) => {
  const parsed = parse(document);
  const errors = validate(schema, parsed);
  if (errors.length > 0) {
    throw new Error(`invalid document: ${errors.map(String).join("; ")}`);
  }
  return execute({ schema, document: parsed, contextValue: context });
};

const viewer = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "test@test.com",
  emailVerified: true,
  role: "user" as const,
};
const otherViewer = { ...viewer, id: "22222222-2222-4222-8222-222222222222" };

const CELLAR = "33333333-3333-4333-8333-333333333333";
const TIER_LIST = "44444444-4444-4444-8444-444444444444";

/** An empty `Page`, which is all these tests need back. */
const emptyPage = () => ({
  entries: [],
  hasNextPage: false,
  hasPreviousPage: false,
  totalCount: 0,
});

const allSearchStubs = () => ({
  "ItemSearchActor.results": emptyPage,
  "CellarItemSearchActor.results": emptyPage,
  "BrandSearchActor.results": emptyPage,
  "RecipeSearchActor.results": emptyPage,
  "UserSearchActor.results": emptyPage,
  "PlaceSearchActor.results": emptyPage,
  "DuplicatePlaceSearchActor.results": emptyPage,
  "GooglePlacesActor.search": () => ({
    suggestions: [],
    charged: true,
    reason: "within free tier",
  }),
  "GeocodeActor.forward": () => null,
  "GeocodeActor.reverse": () => null,
});

/**
 * One document per §2.3 actor, plus the key its builder produces for the same
 * arguments. `key(ctx)` is what the resolver must have addressed.
 */
const FIELDS: readonly {
  readonly actorType: string;
  readonly document: string;
  readonly key: (ctx: Ctx) => string;
  readonly viewerScoped: boolean;
}[] = [
  {
    actorType: "ItemSearchActor",
    document: `{ itemSearch(text: "pinot noir", first: 2) { ... on ItemSearchConnection { edges { cursor } } } }`,
    key: (ctx) =>
      itemSearchActorId(
        {
          text: "pinot noir",
          vector: null,
          itemTypes: null,
          maxDistance: null,
          limit: null,
        },
        ctx.viewerId,
      ),
    viewerScoped: false,
  },
  {
    actorType: "CellarItemSearchActor",
    document: `{ cellarItemSearch(cellarId: "${CELLAR}", query: "oaky", first: 2) { ... on CellarItemSearchConnection { edges { cursor } } } }`,
    key: (ctx) =>
      cellarItemSearchActorId(
        { cellarId: CELLAR, query: "oaky", limit: null },
        ctx.viewerId,
      ),
    viewerScoped: true,
  },
  {
    actorType: "BrandSearchActor",
    document: `{ brandSearch(term: "krug", first: 2) { ... on BrandSearchConnection { edges { cursor } } } }`,
    key: (ctx) =>
      brandSearchActorId({ term: "krug", limit: null }, ctx.viewerId),
    viewerScoped: false,
  },
  {
    actorType: "RecipeSearchActor",
    document: `{ recipeSearch(term: "negroni", first: 2) { ... on RecipeSearchConnection { edges { cursor } } } }`,
    key: (ctx) =>
      recipeSearchActorId(
        {
          term: "negroni",
          semanticQuery: null,
          type: null,
          maxDistance: null,
          limit: null,
        },
        ctx.viewerId,
      ),
    viewerScoped: false,
  },
  {
    actorType: "UserSearchActor",
    document: `{ userSearch(term: "jar", first: 2) { ... on UserSearchConnection { edges { cursor } } } }`,
    key: (ctx) => userSearchActorId({ term: "jar", limit: null }, ctx.viewerId),
    viewerScoped: true,
  },
  {
    actorType: "PlaceSearchActor",
    document: `{ placeSearch(query: "wine bar", first: 2) { ... on PlaceSearchConnection { edges { cursor } } } }`,
    key: (ctx) =>
      placeSearchActorId(
        {
          query: "wine bar",
          bounds: null,
          filterCategories: null,
          minRating: null,
          tierListIds: null,
          visitStatus: null,
          limit: null,
        },
        ctx.viewerId,
      ),
    viewerScoped: false,
  },
  {
    actorType: "PlaceSearchActor",
    document: `{ placeSearch(query: "wine bar", tierListIds: ["${TIER_LIST}"], first: 2) { ... on PlaceSearchConnection { edges { cursor } } } }`,
    key: (ctx) =>
      placeSearchActorId(
        {
          query: "wine bar",
          bounds: null,
          filterCategories: null,
          minRating: null,
          tierListIds: [TIER_LIST],
          visitStatus: null,
          limit: null,
        },
        ctx.viewerId,
      ),
    viewerScoped: true,
  },
  {
    actorType: "DuplicatePlaceSearchActor",
    document: `{ duplicatePlaces(name: "Bar", location: { lng: -83, lat: 40 }, first: 2) { __typename ... on DuplicatePlaceConnection { edges { cursor } } } }`,
    key: (ctx) =>
      duplicatePlaceSearchActorId(
        {
          name: "Bar",
          location: { lng: -83, lat: 40 },
          radiusMeters: null,
          minSimilarity: null,
          limit: null,
        },
        ctx.viewerId,
      ),
    viewerScoped: false,
  },
  {
    actorType: "GooglePlacesActor",
    document: `{ googlePlaceSuggestions(mode: AUTOCOMPLETE, input: "sta", location: { lng: -83, lat: 40 }) { charged } }`,
    key: (ctx) =>
      googlePlacesActorId(
        {
          mode: "autocomplete",
          input: "sta",
          location: { lng: -83, lat: 40 },
          radiusMeters: null,
          maxResults: null,
        },
        ctx.viewerId,
      ),
    viewerScoped: false,
  },
  {
    actorType: "GeocodeActor",
    document: `{ geocode(query: "2136 N High St") { displayName } }`,
    key: (ctx) =>
      geocodeActorId(
        { mode: "forward", query: "2136 N High St" },
        ctx.viewerId,
      ),
    viewerScoped: false,
  },
];

describe("C1 search fields (§2.3)", () => {
  describe("each field addresses the id its key builder produces", () => {
    for (const field of FIELDS) {
      it(`${field.actorType}${field.viewerScoped ? " (viewer-scoped)" : ""}`, async () => {
        const { invoke, calls } = stubSidecar(allSearchStubs());
        const context = testContext(invoke, viewer);
        const result = await run(field.document, context);

        expect(result.errors).toBeUndefined();
        expect(calls[0]?.actorType).toBe(field.actorType);
        expect(calls[0]?.actorId).toBe(field.key(context.ctx));
      });
    }
  });

  describe("the viewer changes the key for exactly the identity-sensitive fields", () => {
    for (const field of FIELDS) {
      it(`${field.actorType}: ${field.viewerScoped ? "differs" : "shared"} between two viewers`, async () => {
        const ids: string[] = [];
        for (const who of [viewer, otherViewer]) {
          const { invoke, calls } = stubSidecar(allSearchStubs());
          await run(field.document, testContext(invoke, who));
          ids.push(calls[0]?.actorId ?? "");
        }
        expect(ids[0] === ids[1]).toBe(!field.viewerScoped);
      });
    }
  });

  describe("pagination is not part of the key (§1.5)", () => {
    it("`first`/`after` change the page and not the activation", async () => {
      const ids: string[] = [];
      for (const document of [
        `{ itemSearch(text: "pinot noir", first: 2) { ... on ItemSearchConnection { edges { cursor } } } }`,
        `{ itemSearch(text: "pinot noir", first: 50) { ... on ItemSearchConnection { edges { cursor } } } }`,
        `{ itemSearch(text: "pinot noir", first: 2, after: "offset:1") { ... on ItemSearchConnection { edges { cursor } } } }`,
      ]) {
        const { invoke, calls } = stubSidecar(allSearchStubs());
        await run(document, testContext(invoke, viewer));
        ids.push(calls[0]?.actorId ?? "");
      }
      expect(new Set(ids).size).toBe(1);
    });

    it("`limit` *is* part of the key — it sizes the held result set", async () => {
      const ids: string[] = [];
      for (const limit of [10, 25]) {
        const { invoke, calls } = stubSidecar(allSearchStubs());
        await run(
          `{ itemSearch(text: "pinot noir", limit: ${limit}, first: 2) { ... on ItemSearchConnection { edges { cursor } } } }`,
          testContext(invoke, viewer),
        );
        ids.push(calls[0]?.actorId ?? "");
      }
      expect(ids[0]).not.toBe(ids[1]);
    });

    it("passes the page through to the actor unchanged", async () => {
      const { invoke, calls } = stubSidecar(allSearchStubs());
      await run(
        `{ itemSearch(text: "pinot noir", first: 5, after: "offset:2") { ... on ItemSearchConnection { edges { cursor } } } }`,
        testContext(invoke, viewer),
      );
      // `args[0]` is the bound `ctx`, `args[1]` the search input (the thing
      // that was hashed), `args[2]` the page (the thing that was not).
      expect(calls[0]?.args[1]).toMatchObject({ text: "pinot noir" });
      expect(calls[0]?.args[2]).toEqual({ first: 5, after: "offset:2" });
    });
  });

  describe("`googlePlaceSuggestions`", () => {
    it("returns a connection of suggestions and says whether it spent money", async () => {
      const { invoke } = stubSidecar({
        ...allSearchStubs(),
        "GooglePlacesActor.search": () => ({
          suggestions: [
            {
              googlePlaceId: "g1",
              name: "Stagger Lee",
              secondaryText: "123 Main St",
              types: ["bar"],
              location: { lng: -83, lat: 40 },
            },
          ],
          charged: false,
          reason: "budget exceeded",
        }),
      });
      const result = await run(
        `{ googlePlaceSuggestions(mode: NEARBY, location: { lng: -83, lat: 40 }) {
             charged reason
             suggestions(first: 5) { edges { node { googlePlaceId name } } }
           } }`,
        testContext(invoke, viewer),
      );
      expect(result.errors).toBeUndefined();
      expect(result.data?.googlePlaceSuggestions).toEqual({
        charged: false,
        reason: "budget exceeded",
        suggestions: {
          edges: [{ node: { googlePlaceId: "g1", name: "Stagger Lee" } }],
        },
      });
    });
  });

  describe("`geocode`", () => {
    it("is null when the geocoder has no specific-enough match", async () => {
      const { invoke } = stubSidecar(allSearchStubs());
      const result = await run(
        `{ geocode(query: "Ohio") { displayName } }`,
        testContext(invoke, viewer),
      );
      expect(result.errors).toBeUndefined();
      expect(result.data?.geocode).toBeNull();
    });
  });
});

/* -------------------------------------------------------------------------- */
/* A7e — the eight paging root fields that were still bare connections         */
/* -------------------------------------------------------------------------- */

/**
 * One row per field A7e converted, driving four assertions each.
 *
 * A7c fixed `referenceData` and left these eight. They failed the same way it
 * did: the field is `<X>Connection!`, so anything raised under it nulled the
 * field, the null could not stop at a non-null field, and the client got
 * `data: null` for the *whole document* — on `/search`, four aliased searches
 * blanked because one had no embedding provider.
 *
 * `mapBrowse` and `rankings` are here rather than in a file of their own
 * because the property under test is the field's *shape*, which is now
 * identical across all eight; `search.test.ts` already owns six of them.
 */
const PAGING_ROOT_FIELDS: readonly {
  readonly field: string;
  readonly connection: string;
  /** `ActorType.method` — the stub whose behaviour each case varies. */
  readonly stub: string;
  /** The field's own required arguments, `first` excluded. */
  readonly args: string;
}[] = [
  {
    field: "itemSearch",
    connection: "ItemSearchConnection",
    stub: "ItemSearchActor.results",
    args: `text: "pinot noir"`,
  },
  {
    field: "cellarItemSearch",
    connection: "CellarItemSearchConnection",
    stub: "CellarItemSearchActor.results",
    args: `cellarId: "${CELLAR}", query: "oaky"`,
  },
  {
    field: "brandSearch",
    connection: "BrandSearchConnection",
    stub: "BrandSearchActor.results",
    args: `term: "krug"`,
  },
  {
    field: "recipeSearch",
    connection: "RecipeSearchConnection",
    stub: "RecipeSearchActor.results",
    args: `term: "negroni"`,
  },
  {
    field: "userSearch",
    connection: "UserSearchConnection",
    stub: "UserSearchActor.results",
    args: `term: "jar"`,
  },
  {
    field: "placeSearch",
    connection: "PlaceSearchConnection",
    stub: "PlaceSearchActor.results",
    args: `query: "wine bar"`,
  },
  {
    field: "mapBrowse",
    connection: "MapEntryConnection",
    stub: "MapActor.browse",
    args: `bounds: { west: -83.1, south: 39.9, east: -82.9, north: 40.1 }`,
  },
  {
    field: "rankings",
    connection: "RankingsConnection",
    stub: "RankingsActor.results",
    args: `scope: EVERYONE`,
  },
] as const;

/** `allSearchStubs` plus the two view actors that are not §2.3 searches. */
const pagingStubs = () => ({
  ...allSearchStubs(),
  "MapActor.browse": emptyPage,
  "RankingsActor.results": emptyPage,
});

/** The selection every caller now writes: the success member, or the error. */
const unionDocument = (
  field: (typeof PAGING_ROOT_FIELDS)[number],
  first: number,
) => `{
  ${field.field}(${field.args}, first: ${first}) {
    __typename
    ... on ${field.connection} { totalCount }
    ... on ActorError { code message }
  }
}`;

describe("every paging root field degrades per field, not per document (A7e)", () => {
  for (const field of PAGING_ROOT_FIELDS) {
    describe(field.field, () => {
      it("returns the connection unchanged on the success path", async () => {
        const { invoke } = stubSidecar(pagingStubs());
        const result = await run(
          unionDocument(field, 2),
          testContext(invoke, viewer),
        );
        expect(result.errors).toBeUndefined();
        expect(result.data?.[field.field]).toEqual({
          __typename: field.connection,
          totalCount: 0,
        });
      });

      it("relays an actor's typed error as a selectable ActorError", async () => {
        const { invoke } = stubSidecar({
          ...pagingStubs(),
          // Reconstructed from the Dapr envelope by `dapr.ts` in production;
          // thrown directly here, which is the same class `plugin-errors`
          // matches on.
          [field.stub]: () => {
            throw new ConflictError("the actor said no");
          },
        });
        const result = await run(
          unionDocument(field, 2),
          testContext(invoke, viewer),
        );
        expect(result.errors).toBeUndefined();
        expect(result.data?.[field.field]).toEqual({
          __typename: "ConflictError",
          code: "CONFLICT",
          message: "the actor said no",
        });
      });

      it("puts the page cap in `data` instead of nulling the document", async () => {
        const { invoke } = stubSidecar(pagingStubs());
        const result = await run(
          unionDocument(field, 5000),
          testContext(invoke, viewer),
        );
        expect(result.errors).toBeUndefined();
        expect(result.data?.[field.field]).toEqual({
          __typename: "ValidationError",
          code: "VALIDATION",
          message: "first must be at most 100, got 5000",
        });
      });

      /**
       * The distinction A7e must not blur. `dapr.ts` only reconstructs an
       * `ActorError` when the body parses as `{ code, message }` — a `200`
       * carrying `X-Daprerrorresponseheader`. Everything else is an
       * `ActorInvocationError`, which is not one of the five classes
       * `plugin-errors` was given, so it is re-thrown, masked by `index.ts`,
       * and stays a top-level error. "The sidecar is unreachable" must never
       * arrive as a typed domain error a client would render as advice.
       */
      it("does not launder a transport failure into a typed error", async () => {
        const { invoke } = stubSidecar({
          ...pagingStubs(),
          [field.stub]: () => {
            throw new ActorInvocationError(
              field.stub.split(".")[0] ?? "",
              "some-id",
              field.stub.split(".")[1] ?? "",
              503,
              "upstream connect error",
            );
          },
        });
        const result = await run(
          unionDocument(field, 2),
          testContext(invoke, viewer),
        );
        expect(result.errors).toHaveLength(1);
        expect(result.data).toBeNull();
      });
    });
  }
});

/**
 * The anonymous cases the two view actors guard, now typed.
 *
 * `mapBrowse` and `rankings` raise `ForbiddenError` in the resolver, before
 * addressing anything — until A7e that reached the client as a top-level
 * `FORBIDDEN` with `data: null`.
 */
describe("a resolver-raised ForbiddenError is a union member too (A7e)", () => {
  for (const field of PAGING_ROOT_FIELDS.filter((entry) =>
    ["mapBrowse", "rankings"].includes(entry.field),
  )) {
    it(`${field.field} refuses an anonymous request in \`data\``, async () => {
      const { invoke, calls } = stubSidecar(pagingStubs());
      const result = await run(unionDocument(field, 2), testContext(invoke));
      expect(result.errors).toBeUndefined();
      expect(result.data?.[field.field]).toMatchObject({
        __typename: "ForbiddenError",
        code: "FORBIDDEN",
      });
      expect(calls).toHaveLength(0);
    });
  }
});
