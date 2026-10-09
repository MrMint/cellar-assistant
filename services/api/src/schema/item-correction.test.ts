/**
 * X19 — `rereadItemLabel`, `suggestItemDetails` and `replaceItemBrand`: each
 * resolver is the right actor calls, in order, with the right arguments, and a
 * refusal lands on the field's typed error union. The actors are stubbed; their
 * own suites (`item-actor.test.ts`, `item-onboarding-correction.test.ts`) hold
 * the behaviour.
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

const WINE_ID = "22222222-2222-4222-8222-222222222222";
const ONBOARDING_ID = "33333333-3333-4333-8333-333333333333";
const BRAND_ID = "44444444-4444-4444-8444-444444444444";
const OLD_BRAND_ID = "55555555-5555-4555-8555-555555555555";

describe("rereadItemLabel", () => {
  it("asks the item which onboarding it came from, then reads there", async () => {
    const { invoke, calls } = stubSidecar({
      "ItemActor.correctionSource": () => ({
        onboardingId: ONBOARDING_ID,
        hasLabel: true,
      }),
      "ItemOnboardingActor.rereadLabel": () => ({
        defaults: JSON.stringify({ name: "LYTTON SPRINGS" }),
        brandName: "Ridge",
        confidence: 0.8,
        model: "m",
      }),
    });
    const result = await run(
      `mutation { rereadItemLabel(type: WINE, itemId: "${WINE_ID}") {
         __typename
         ... on ItemLabelReading { defaults brandName confidence }
       } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.rereadItemLabel).toEqual({
      __typename: "ItemLabelReading",
      defaults: { name: "LYTTON SPRINGS" },
      brandName: "Ridge",
      confidence: 0.8,
    });
    expect(
      calls.map((c) => `${c.actorType}(${c.actorId}).${c.method}`),
    ).toEqual([
      `ItemActor(wine:${WINE_ID}).correctionSource`,
      `ItemOnboardingActor(${ONBOARDING_ID}).rereadLabel`,
    ]);
    expect(calls[1]?.args[1]).toEqual({ item: { type: "WINE", id: WINE_ID } });
  });

  it("refuses without calling a model when the item kept no label, or is not yours", async () => {
    for (const [source, typename] of [
      [{ onboardingId: ONBOARDING_ID, hasLabel: false }, "ConflictError"],
      [null, "ForbiddenError"],
    ] as const) {
      const { invoke, calls } = stubSidecar({
        "ItemActor.correctionSource": () => source,
      });
      const result = await run(
        `mutation { rereadItemLabel(type: WINE, itemId: "${WINE_ID}") {
           __typename
         } }`,
        testContext(invoke, viewer),
      );
      expect(result.errors).toBeUndefined();
      expect(result.data?.rereadItemLabel).toEqual({ __typename: typename });
      expect(calls.map((c) => c.method)).toEqual(["correctionSource"]);
    }
  });
});

describe("suggestItemDetails", () => {
  it("passes the form's current values through and returns the proposal", async () => {
    const { invoke, calls } = stubSidecar({
      "ItemActor.correctionSource": () => ({
        onboardingId: ONBOARDING_ID,
        hasLabel: false,
      }),
      "ItemOnboardingActor.suggestDetails": () => ({
        abstained: false,
        note: "Ridge Lytton Springs.",
        defaults: JSON.stringify({ wine: { variety: "ZINFANDEL" } }),
        model: "m",
      }),
    });
    const result = await run(
      `mutation { suggestItemDetails(type: WINE, itemId: "${WINE_ID}", input: {
           name: "Lytton Springs", brandName: "Ridge", attributes: { style: "RED" }
         }) {
         __typename
         ... on ItemDetailSuggestions { abstained note defaults }
       } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.suggestItemDetails).toEqual({
      __typename: "ItemDetailSuggestions",
      abstained: false,
      note: "Ridge Lytton Springs.",
      defaults: { wine: { variety: "ZINFANDEL" } },
    });
    expect(calls[1]?.args[1]).toEqual({
      item: { type: "WINE", id: WINE_ID },
      name: "Lytton Springs",
      brandName: "Ridge",
      country: null,
      attributes: { style: "RED" },
    });
  });
});

describe("replaceItemBrand", () => {
  it("is one ItemActor call, and the creator check lands on the union", async () => {
    const { invoke, calls } = stubSidecar({
      "ItemActor.replacePrimaryBrand": () => ({
        id: "66666666-6666-4666-8666-666666666666",
        itemId: WINE_ID,
        itemType: "WINE",
        brandId: BRAND_ID,
        isPrimary: true,
        createdAt: "2026-10-08T00:00:00.000Z",
      }),
    });
    const result = await run(
      `mutation { replaceItemBrand(type: WINE, itemId: "${WINE_ID}",
           brandId: "${BRAND_ID}", replacesBrandId: "${OLD_BRAND_ID}") {
         __typename
         ... on ItemBrand { isPrimary }
       } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.replaceItemBrand).toEqual({
      __typename: "ItemBrand",
      isPrimary: true,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[1]).toEqual({
      brandId: BRAND_ID,
      replacesBrandId: OLD_BRAND_ID,
    });

    const refused = stubSidecar({
      "ItemActor.replacePrimaryBrand": () => {
        throw new ForbiddenError("only the creator may change its brand");
      },
    });
    const denied = await run(
      `mutation { replaceItemBrand(type: WINE, itemId: "${WINE_ID}",
           brandId: "${BRAND_ID}") { __typename } }`,
      testContext(refused.invoke, viewer),
    );
    expect(denied.data?.replaceItemBrand).toEqual({
      __typename: "ForbiddenError",
    });
  });
});

describe("suggestNewItemDetails (X07)", () => {
  const DRAFT_ID = "66666666-6666-4666-8666-666666666666";

  it("asks the draft's own onboarding actor, with the draft's values", async () => {
    const { invoke, calls } = stubSidecar({
      "ItemOnboardingActor.suggestNewItem": () => ({
        abstained: true,
        note: "Not a product I know.",
        defaults: "{}",
        model: "m",
      }),
    });
    const result = await run(
      `mutation { suggestNewItemDetails(draftId: "${DRAFT_ID}", type: SPIRIT, input: {
           name: "House Old Fashioned Rye"
         }) {
         __typename
         ... on ItemDetailSuggestions { abstained note defaults }
       } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.suggestNewItemDetails).toEqual({
      __typename: "ItemDetailSuggestions",
      abstained: true,
      note: "Not a product I know.",
      defaults: {},
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.actorType).toBe("ItemOnboardingActor");
    expect(calls[0]?.actorId).toBe(DRAFT_ID);
    expect(calls[0]?.args[1]).toEqual({
      itemType: "SPIRIT",
      name: "House Old Fashioned Rye",
      brandName: null,
      country: null,
      attributes: null,
    });
  });

  it("a refusal is the field's typed error, not a top-level failure", async () => {
    const { invoke } = stubSidecar({
      "ItemOnboardingActor.suggestNewItem": () => {
        throw new ForbiddenError("sign in to ask for details about a new item");
      },
    });
    const result = await run(
      `mutation { suggestNewItemDetails(draftId: "${DRAFT_ID}", type: WINE, input: { name: "x" }) {
         __typename
       } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.suggestNewItemDetails).toEqual({
      __typename: "ForbiddenError",
    });
  });
});
