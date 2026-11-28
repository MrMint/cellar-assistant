/**
 * SV-B · MC-drafts at the API: `saveDraft`, `needsDetails`,
 * `needsDetailsCount`, `Item.unconfirmedFields`, and the new
 * `ItemOnboarding` fields. The actors are stubbed; what is pinned here is
 * the wiring — which actor, which key, which arguments.
 */
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@cellar-assistant/contracts";
import { execute, parse } from "graphql";
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

const ONBOARDING_ID = "66666666-6666-4666-8666-666666666666";
const CELLAR_ID = "22222222-2222-4222-8222-222222222222";

const draft = {
  id: ONBOARDING_ID,
  userId: viewer.id,
  status: "NEEDS_DETAILS" as const,
  itemType: "WINE" as const,
  barcode: null,
  barcodeType: null,
  frontLabelImageId: null,
  backLabelImageId: null,
  defaults: null,
  rawDefaults: null,
  detectedItemType: null,
  aiModel: null,
  confidence: null,
  lastReprocessResult: null,
  createdAt: "2026-11-26T00:00:00.000Z",
  updatedAt: "2026-11-26T00:00:00.000Z",
  cellarId: CELLAR_ID,
  confirmedFields: ["name"],
  vintageAnswer: "NON_VINTAGE" as const,
  displayName: "Demo Rioja",
  displayMaker: "Demo Bodega",
  imageId: null,
  draftFields: JSON.stringify({ name: "Demo Rioja" }),
};

const DRAFT_FIELDS = `
  id status cellarId confirmedFields vintageAnswer displayName displayMaker
  imageId draftFields
`;

describe("saveDraft (SV-B)", () => {
  it("sends the draft to the onboarding's own actor and answers the row", async () => {
    const { invoke, calls } = stubSidecar({
      "ItemOnboardingActor.saveDraft": () => draft,
    });
    const result = await run(
      `mutation {
         saveDraft(input: {
           onboardingId: "${ONBOARDING_ID}", cellarId: "${CELLAR_ID}",
           fields: { name: "Demo Rioja" }, confirmedFields: ["name"],
           vintageAnswer: NON_VINTAGE
         }) {
           __typename
           ... on ItemOnboarding { ${DRAFT_FIELDS} }
         }
       }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls[0]).toMatchObject({
      actorType: "ItemOnboardingActor",
      actorId: ONBOARDING_ID,
      method: "saveDraft",
    });
    expect(calls[0]?.args[1]).toEqual({
      cellarId: CELLAR_ID,
      fields: { name: "Demo Rioja" },
      confirmedFields: ["name"],
      vintageAnswer: "NON_VINTAGE",
    });
    expect(result.data?.saveDraft).toEqual({
      __typename: "ItemOnboarding",
      id: ONBOARDING_ID,
      status: "NEEDS_DETAILS",
      cellarId: CELLAR_ID,
      confirmedFields: ["name"],
      vintageAnswer: "NON_VINTAGE",
      displayName: "Demo Rioja",
      displayMaker: "Demo Bodega",
      imageId: null,
      draftFields: { name: "Demo Rioja" },
    });
  });

  it("puts the actor's refusals on the result union", async () => {
    for (const [error, typename] of [
      [new NotFoundError("ItemOnboardingActor(x) has no row"), "NotFoundError"],
      [new ConflictError("closed"), "ConflictError"],
    ] as const) {
      const { invoke } = stubSidecar({
        "ItemOnboardingActor.saveDraft": () => {
          throw error;
        },
      });
      const result = await run(
        `mutation {
           saveDraft(input: {
             onboardingId: "${ONBOARDING_ID}", fields: {}, confirmedFields: [],
             vintageAnswer: UNANSWERED
           }) { __typename }
         }`,
        testContext(invoke, viewer),
      );
      expect(result.errors).toBeUndefined();
      expect(result.data?.saveDraft).toEqual({ __typename: typename });
    }
  });
});

describe("needsDetails / needsDetailsCount (SV-B)", () => {
  it("asks the viewer's DraftsCollectionActor, with or without a cellar", async () => {
    const { invoke, calls } = stubSidecar({
      "DraftsCollectionActor.needsDetails": () => [draft],
      "DraftsCollectionActor.needsDetailsCount": () => 1,
    });
    const result = await run(
      `{
         one: needsDetails(cellarId: "${CELLAR_ID}", first: 1) {
           ... on ItemOnboardingConnection {
             totalCount
             edges { node { id displayName } }
             pageInfo { hasNextPage }
           }
         }
         all: needsDetailsCount
       }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      one: {
        totalCount: 1,
        edges: [{ node: { id: ONBOARDING_ID, displayName: "Demo Rioja" } }],
        pageInfo: { hasNextPage: false },
      },
      all: 1,
    });
    expect(calls.map((c) => [c.actorId, c.method, c.args[1]])).toEqual([
      [viewer.id, "needsDetails", { cellarId: CELLAR_ID }],
      [viewer.id, "needsDetailsCount", {}],
    ]);
  });

  it("a malformed cellarId is the list's ValidationError, not a blank response (F-74)", async () => {
    const { invoke } = stubSidecar({
      "DraftsCollectionActor.needsDetails": () => {
        throw new ValidationError('cellarId must be a UUID, got "x"');
      },
      "DraftsCollectionActor.needsDetailsCount": () => {
        throw new ValidationError('cellarId must be a UUID, got "x"');
      },
    });
    const result = await run(
      `{
         needsDetails(cellarId: "x") { __typename }
         needsDetailsCount(cellarId: "x")
       }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      needsDetails: { __typename: "ValidationError" },
      needsDetailsCount: 0,
    });
  });

  it("is empty for an anonymous viewer, with no actor call", async () => {
    const { invoke, calls } = stubSidecar({});
    const result = await run(
      "{ needsDetails { ... on ItemOnboardingConnection { totalCount edges { node { id } } } } needsDetailsCount }",
      testContext(invoke),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      needsDetails: { totalCount: 0, edges: [] },
      needsDetailsCount: 0,
    });
    expect(calls).toEqual([]);
  });
});

describe("Viewer.unconfirmedBottleCount (F-76)", () => {
  it("asks the viewer's DraftsCollectionActor", async () => {
    const { invoke, calls } = stubSidecar({
      "DraftsCollectionActor.unconfirmedBottleCount": () => 3,
    });
    const result = await run(
      "{ me { unconfirmedBottleCount } }",
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({ me: { unconfirmedBottleCount: 3 } });
    expect(calls.map((c) => [c.actorId, c.method])).toEqual([
      [viewer.id, "unconfirmedBottleCount"],
    ]);
  });
});

describe("confirmItemOnboarding: absent cellar vs null (SV-B)", () => {
  const confirmed = {
    onboardingId: ONBOARDING_ID,
    item: { type: "WINE" as const, id: "77777777-7777-4777-8777-777777777777" },
    brandId: null,
    cellarItemId: null,
    barcode: null,
  };

  it("leaves cellarId out when absent, so a draft's own cellar stands, and passes confirmedFields", async () => {
    const { invoke, calls } = stubSidecar({
      "ItemOnboardingActor.confirm": () => confirmed,
    });
    const result = await run(
      `mutation {
         confirmItemOnboarding(onboardingId: "${ONBOARDING_ID}", input: {
           name: "Demo Rioja", confirmedFields: ["name", "style"]
         }) { __typename }
       }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const sent = calls[0]?.args[1] as Record<string, unknown>;
    expect("cellarId" in sent).toBe(false);
    expect(sent.confirmedFields).toEqual(["name", "style"]);
  });

  it("sends an explicit null cellar as null", async () => {
    const { invoke, calls } = stubSidecar({
      "ItemOnboardingActor.confirm": () => confirmed,
    });
    await run(
      `mutation {
         confirmItemOnboarding(onboardingId: "${ONBOARDING_ID}", input: {
           name: "Demo Rioja", cellarId: null
         }) { __typename }
       }`,
      testContext(invoke, viewer),
    );
    expect(calls[0]?.args[1]).toMatchObject({ cellarId: null });
  });
});

describe("Item.unconfirmedFields (SV-B)", () => {
  const wine = {
    id: "w1",
    type: "WINE" as const,
    name: "Demo Wine",
    description: null,
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
    createdById: viewer.id,
    barcodeCode: null,
    country: null,
    vintage: null,
    variety: null,
    region: null,
    style: "RED",
    alcoholContentPercentage: null,
  };

  it("is one batched DraftsCollectionActor call for the viewer", async () => {
    const { invoke, calls } = stubSidecar({
      "ItemActor.get": () => wine,
      "DraftsCollectionActor.unconfirmedFields": () => [["vintage"]],
    });
    const result = await run(
      `{ item(type: WINE, id: "w1") {
           ... on QueryItemSuccess { data { unconfirmedFields } }
         } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.item).toEqual({
      data: { unconfirmedFields: ["vintage"] },
    });
    const call = calls.find((c) => c.method === "unconfirmedFields");
    expect(call?.actorId).toBe(viewer.id);
    expect(call?.args[1]).toEqual([{ type: "WINE", id: "w1" }]);
  });

  it("is empty for an anonymous viewer, with no collection call", async () => {
    const { invoke, calls } = stubSidecar({ "ItemActor.get": () => wine });
    const result = await run(
      `{ item(type: WINE, id: "w1") {
           ... on QueryItemSuccess { data { unconfirmedFields } }
         } }`,
      testContext(invoke),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.item).toEqual({ data: { unconfirmedFields: [] } });
    expect(calls.filter((c) => c.method === "unconfirmedFields")).toEqual([]);
  });
});

describe("ItemOnboarding.detectedItemType (F-77)", () => {
  it("answers the kind the label read found", async () => {
    const { invoke } = stubSidecar({
      "ItemOnboardingActor.saveDraft": () => ({
        ...draft,
        detectedItemType: "BEER",
      }),
    });
    const result = await run(
      `mutation { saveDraft(input: {
        onboardingId: "${ONBOARDING_ID}", cellarId: "${CELLAR_ID}",
        fields: { name: "x" }, confirmedFields: ["name"], vintageAnswer: NON_VINTAGE
      }) { __typename ... on ItemOnboarding { itemType detectedItemType } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.saveDraft).toEqual({
      __typename: "ItemOnboarding",
      itemType: "WINE",
      detectedItemType: "BEER",
    });
  });
});
