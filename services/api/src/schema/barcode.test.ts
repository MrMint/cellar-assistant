/**
 * The barcode and onboarding schema, executed against a stub sidecar (B2).
 *
 * The behaviour lives in `services/actors/src/actors/barcode-actor.test.ts` and
 * `item-onboarding-actor.test.ts` — including the proof that a non-owner
 * cannot write a `barcodes` row, which is target-stack §7's live gap. This
 * file proves what belongs here: that each field is one actor call with `ctx`
 * bound, that the refusal reaches the client as a typed `ForbiddenError` on
 * the `<Command>Result` union rather than a 500, and that there is no
 * `updateBarcode` field for a client to reach for.
 */
import { ForbiddenError } from "@cellar-assistant/contracts";
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

const CODE = "0000000000001";

const wine = {
  id: "w1",
  type: "WINE" as const,
  name: "A Wine",
  description: null,
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
  createdById: viewer.id,
  barcodeCode: CODE,
  country: null,
  vintage: "2019-01-01",
  variety: null,
  region: null,
  style: "RED",
  alcoholContentPercentage: null,
};

describe("barcode query", () => {
  it("resolves the code and its items through one actor call", async () => {
    const { invoke, calls } = stubSidecar({
      "BarcodeActor.get": () => ({
        code: CODE,
        type: "EAN13",
        items: [{ type: "WINE", id: "w1" }],
      }),
      "ItemActor.get": () => wine,
    });
    const result = await run(
      `{ barcode(code: "${CODE}") {
           __typename
           ... on Barcode {
             code type
             items(first: 5) { totalCount edges { node { __typename id name } } }
           }
         } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.barcode).toMatchObject({
      __typename: "Barcode",
      code: CODE,
      type: "EAN13",
      items: {
        totalCount: 1,
        edges: [{ node: { __typename: "Wine", id: "w1", name: "A Wine" } }],
      },
    });
    expect(calls[0]).toMatchObject({
      actorType: "BarcodeActor",
      actorId: CODE,
      method: "get",
    });
    // The item came through the shared loader, keyed `wine:w1`.
    expect(calls[1]).toMatchObject({
      actorType: "ItemActor",
      actorId: "wine:w1",
    });
  });
});

describe("the §7 gap is not reachable from the schema either", () => {
  /**
   * `public_barcodes.yaml` grants role `user` `update_permissions` over
   * `[code, type]` with `filter: {}`. There is deliberately no field here that
   * corresponds to it: `ensureBarcode` is find-or-create, and re-typing an
   * existing row is refused by the actor unless the caller is an admin.
   */
  it("exposes no updateBarcode mutation", () => {
    const mutation = schema.getMutationType();
    expect(Object.keys(mutation?.getFields() ?? {})).not.toContain(
      "updateBarcode",
    );
    expect(Object.keys(mutation?.getFields() ?? {})).toContain("ensureBarcode");
  });

  it("surfaces the actor's refusal as ForbiddenError on the union", async () => {
    const { invoke } = stubSidecar({
      "BarcodeActor.ensure": () => {
        throw new ForbiddenError(
          `barcode ${CODE} already exists with type EAN13; only an admin may change it`,
        );
      },
    });
    const result = await run(
      `mutation { ensureBarcode(code: "${CODE}", type: "UPC_A") {
         __typename ... on ActorError { code message } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.ensureBarcode).toEqual({
      __typename: "ForbiddenError",
      code: "FORBIDDEN",
      message: `barcode ${CODE} already exists with type EAN13; only an admin may change it`,
    });
  });

  it("linkBarcodeItem refuses a non-creator with a typed error", async () => {
    const { invoke, calls } = stubSidecar({
      "BarcodeActor.linkItem": () => {
        throw new ForbiddenError(
          "only the creator of wine w1 may link a barcode to it",
        );
      },
    });
    const result = await run(
      `mutation { linkBarcodeItem(code: "${CODE}", itemType: WINE, itemId: "w1") {
         __typename ... on ActorError { code } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.linkBarcodeItem).toEqual({
      __typename: "ForbiddenError",
      code: "FORBIDDEN",
    });
    // The payload is an object, and `ctx` came first (§8.2).
    expect(calls[0]?.args[0]).toMatchObject({ viewerId: viewer.id });
    expect(calls[0]?.args[1]).toEqual({ itemType: "WINE", itemId: "w1" });
  });

  it("reports the queued outbox row on success", async () => {
    const { invoke } = stubSidecar({
      "BarcodeActor.linkItem": () => ({
        code: CODE,
        item: { type: "WINE", id: "w1" },
        outboxRowId: "row-1",
      }),
      "ItemActor.get": () => wine,
    });
    const result = await run(
      `mutation { linkBarcodeItem(code: "${CODE}", itemType: WINE, itemId: "w1") {
         __typename
         ... on LinkedBarcodeItem { code outboxRowId item { id __typename } } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.linkBarcodeItem).toEqual({
      __typename: "LinkedBarcodeItem",
      code: CODE,
      outboxRowId: "row-1",
      item: { id: "w1", __typename: "Wine" },
    });
  });
});

/**
 * Every field addresses `BarcodeActor(barcodeActorId(code, …))`, never the
 * argument as sent — which is what makes a UPC-A scan and an EAN-13 scan of
 * one bottle the same actor (and what `BarcodeActor` insists on: it refuses a
 * non-canonical key as absent).
 */
describe("barcode fields route to the canonical key", () => {
  const dto = { code: "00036000291452", type: "UPC_A", items: [] };
  const linked = {
    code: "00036000291452",
    item: { type: "WINE", id: "w1" },
    outboxRowId: null,
  };

  it.each([
    ["UPC-A", "036000291452", "00036000291452"],
    ["EAN-13", "0036000291452", "00036000291452"],
    ["GTIN-14", "00036000291452", "00036000291452"],
    ["UPC-E", "04252614", "00042100005264"],
    ["lower-case text", "abc123", "ABC123"],
    ["padded text", "  ABC123 ", "ABC123"],
    ["a bad check digit, kept opaque", "036000291453", "036000291453"],
  ])("%s: %s → BarcodeActor(%s)", async (_label, code, key) => {
    const { invoke, calls } = stubSidecar({
      "BarcodeActor.get": () => dto,
      "BarcodeActor.ensure": () => dto,
      "BarcodeActor.linkItem": () => linked,
    });
    const context = testContext(invoke, viewer);
    await run(
      `{ barcode(code: ${JSON.stringify(code)}) { __typename } }`,
      context,
    );
    await run(
      `mutation { ensureBarcode(code: ${JSON.stringify(code)}) { __typename } }`,
      context,
    );
    await run(
      `mutation { linkBarcodeItem(code: ${JSON.stringify(code)}, itemType: WINE, itemId: "w1") { __typename } }`,
      context,
    );
    expect(
      calls.map((call) => [call.actorType, call.actorId, call.method]),
    ).toEqual([
      ["BarcodeActor", key, "get"],
      ["BarcodeActor", key, "ensure"],
      ["BarcodeActor", key, "linkItem"],
    ]);
  });

  it("ensureBarcode passes its type as the symbology hint", async () => {
    const { invoke, calls } = stubSidecar({
      "BarcodeActor.ensure": () => dto,
    });
    const context = testContext(invoke, viewer);
    // `01234565` is a valid EAN-8 and a valid UPC-E; the type decides.
    for (const type of ["EAN_8", "UPC_E"]) {
      await run(
        `mutation { ensureBarcode(code: "01234565", type: "${type}") { __typename } }`,
        context,
      );
    }
    expect(calls.map((call) => call.actorId)).toEqual([
      "00000001234565",
      "00012345000065",
    ]);
    expect(calls[0]?.args[1]).toEqual({ type: "EAN_8" });
  });
});

describe("item onboarding", () => {
  const onboarding = {
    id: "o1",
    userId: viewer.id,
    status: "COMPLETED",
    itemType: "WINE",
    barcode: CODE,
    barcodeType: "EAN13",
    frontLabelImageId: "f1",
    backLabelImageId: null,
    defaults: '{"name":"Château Test"}',
    rawDefaults: '{"name":"Château Test"}',
    aiModel: "test-vision-1",
    confidence: 0.82,
    lastReprocessResult: null,
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
  };

  it("startItemOnboarding is one actor call and parses `defaults` back to JSON", async () => {
    const { invoke, calls } = stubSidecar({
      "ItemOnboardingActor.start": () => onboarding,
    });
    const result = await run(
      `mutation { startItemOnboarding(
           onboardingId: "o1"
           input: { itemType: WINE, barcode: "${CODE}", frontLabelImageId: "f1" }
         ) { __typename ... on ItemOnboarding {
             id status itemType aiModel confidence defaults } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.startItemOnboarding).toEqual({
      __typename: "ItemOnboarding",
      id: "o1",
      status: "COMPLETED",
      itemType: "WINE",
      aiModel: "test-vision-1",
      confidence: 0.82,
      defaults: { name: "Château Test" },
    });
    expect(calls[0]).toMatchObject({
      actorType: "ItemOnboardingActor",
      actorId: "o1",
      method: "start",
    });
    expect(calls[0]?.args[1]).toEqual({
      itemType: "WINE",
      frontLabelImageId: "f1",
      backLabelImageId: null,
      barcode: CODE,
      barcodeType: null,
    });
  });

  it("confirmItemOnboarding reports the ids it minted, before the outbox has run", async () => {
    const { invoke, calls } = stubSidecar({
      "ItemOnboardingActor.confirm": () => ({
        onboardingId: "o1",
        item: { type: "WINE", id: "w1" },
        brandId: "b1",
        cellarItemId: "ci1",
        barcode: CODE,
      }),
      // The item does not exist yet — the outbox has not delivered `create`.
      "ItemActor.get": () => {
        throw new Error("not created yet");
      },
    });
    const result = await run(
      `mutation { confirmItemOnboarding(
           onboardingId: "o1"
           input: { name: "Château Test", brandName: "Château Test", cellarId: "c1" }
         ) { __typename ... on ConfirmedItemOnboarding {
             onboardingId itemId itemType brandId cellarItemId barcode } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.confirmItemOnboarding).toEqual({
      __typename: "ConfirmedItemOnboarding",
      onboardingId: "o1",
      itemId: "w1",
      itemType: "WINE",
      brandId: "b1",
      cellarItemId: "ci1",
      barcode: CODE,
    });
    expect(calls[0]?.args[1]).toMatchObject({
      name: "Château Test",
      brandName: "Château Test",
      cellarId: "c1",
    });
  });

  it("an onboarding that is not yours is NotFound on the union", async () => {
    const { invoke } = stubSidecar({
      "ItemOnboardingActor.get": () => {
        throw new ForbiddenError("onboarding o1 is not yours");
      },
    });
    const result = await run(
      `{ itemOnboarding(id: "o1") { __typename ... on ActorError { code } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.itemOnboarding).toEqual({
      __typename: "ForbiddenError",
      code: "FORBIDDEN",
    });
  });
});
