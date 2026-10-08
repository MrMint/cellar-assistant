/**
 * The onboarding machine's capture path, end to end over fake actors:
 * upload → analyze → matching (N19) → quick review or the form.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Client } from "urql";
import { createActor, fromPromise, waitFor } from "xstate";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import type {
  DefaultValuesResult,
  InsertCellarItemInput,
  SearchCatalogInput,
  UploadItemImageInput,
} from "./actors/types";
import { formDefaultsFromOnboarding } from "./adapter";
import type { CatalogMatch } from "./catalog-match";
import { OnboardingMachine } from "./machines";

const read = formDefaultsFromOnboarding("WINE", {
  name: "Château Margaux",
  wine: { vintage: "2015-01-01", style: "RED" },
});

const exact: CatalogMatch = {
  item: {
    id: "known",
    itemId: "known",
    name: "Château Margaux",
    vintage: "2015",
  },
  type: "WINE",
  source: "search",
  distance: 0.1,
  exact: true,
};

const run = ({
  confidence = 0.95,
  match = null as CatalogMatch | null,
  inCellar = true,
  itemType = "WINE" as ApiItemType,
}) => {
  const filed: InsertCellarItemInput[] = [];
  const photographed: UploadItemImageInput[] = [];
  const searched: SearchCatalogInput[] = [];
  const machine = OnboardingMachine.provide({
    actors: {
      uploadFiles: fromPromise(async () => ({ frontLabelFileId: "front" })),
      fetchDefaults: fromPromise(
        async (): Promise<DefaultValuesResult> => ({
          defaults: read,
          itemOnboardingId: "onb",
          confidence,
        }),
      ),
      searchCatalog: fromPromise(
        async ({ input }: { input: SearchCatalogInput }) => {
          searched.push(input);
          return match;
        },
      ),
      insertCellarItem: fromPromise(
        async ({ input }: { input: InsertCellarItemInput }) => {
          filed.push(input);
          return { itemId: input.cellarItemId };
        },
      ),
      uploadItemImage: fromPromise(
        async ({ input }: { input: UploadItemImageInput }) => {
          photographed.push(input);
          return {};
        },
      ),
    },
  });
  const actor = createActor(machine, {
    input: {
      urqlClient: {} as Client,
      router: { push: () => {} },
      cellarId: inCellar ? "cellar-1" : undefined,
      itemType,
    },
  });
  actor.start();
  actor.send({
    type: "COMPLETE",
    frontLabel: "data:image/jpeg;base64,AA==",
    declinedItemIds: ["declined"],
  });
  return { actor, filed, photographed, searched };
};

const settled = (actor: ReturnType<typeof run>["actor"]) =>
  waitFor(actor, (s) =>
    ["form", "quickReview", "finalPrompt", "addFailed"].includes(
      String(s.value),
    ),
  );

describe("matching (N19)", () => {
  test("the read goes to the catalogue lookup, declined items excluded", async () => {
    const { actor, searched } = run({ confidence: 0.5 });
    await settled(actor);
    assert.equal(searched.length, 1);
    assert.equal(searched[0]?.defaults.values.name, "Château Margaux");
    assert.deepEqual(searched[0]?.excludeItemIds, ["declined"]);
  });

  test("no match → the form, as before", async () => {
    const { actor } = run({ confidence: 0.5 });
    const state = await settled(actor);
    assert.equal(state.value, "form");
    assert.equal(state.context.catalogMatch, undefined);
  });

  test("a match leads the form; +1 bottle files the known item", async () => {
    const { actor, filed } = run({
      confidence: 0.5,
      match: { ...exact, exact: false },
    });
    const state = await settled(actor);
    assert.equal(state.value, "form");
    assert.equal(state.context.catalogMatch?.item.itemId, "known");
    actor.send({ type: "USE_MATCH" });
    await waitFor(actor, (s) => s.value === "finalPrompt");
    assert.equal(filed.length, 1);
    assert.equal(filed[0]?.itemId, "known");
    assert.equal(filed[0]?.cellarId, "cellar-1");
  });

  test("outside a cellar the match is used as the item, no bottle filed", async () => {
    const { actor, filed, photographed } = run({
      confidence: 0.5,
      match: exact,
      inCellar: false,
    });
    await settled(actor);
    actor.send({ type: "USE_MATCH" });
    await waitFor(actor, (s) => s.value === "finalPrompt");
    assert.equal(filed.length, 0);
    assert.equal(photographed[0]?.itemId, "known");
  });

  test("No, it's new: the prompt goes and the item joins the declined", async () => {
    const { actor } = run({ confidence: 0.5, match: exact });
    await settled(actor);
    actor.send({ type: "DISMISS_MATCH" });
    const state = actor.getSnapshot();
    assert.equal(state.value, "form");
    assert.equal(state.context.catalogMatch, undefined);
    assert.deepEqual(state.context.declinedItemIds, ["declined", "known"]);
  });

  test("a failed lookup is the old path to the form", async () => {
    const machine = OnboardingMachine.provide({
      actors: {
        uploadFiles: fromPromise(async () => ({ frontLabelFileId: "f" })),
        fetchDefaults: fromPromise(
          async (): Promise<DefaultValuesResult> => ({
            defaults: read,
            itemOnboardingId: "onb",
            confidence: 1,
          }),
        ),
        searchCatalog: fromPromise(async (): Promise<CatalogMatch | null> => {
          throw new Error("network");
        }),
      },
    });
    const actor = createActor(machine, {
      input: {
        urqlClient: {} as Client,
        router: { push: () => {} },
        cellarId: "c",
        itemType: "WINE",
      },
    });
    actor.start();
    actor.send({ type: "COMPLETE", frontLabel: "data:x" });
    const state = await settled(actor);
    assert.equal(state.value, "form");
  });
});

describe("quick add (N02: only another bottle of a known item)", () => {
  test("an exact match at high confidence → the card; CONFIRM files that item", async () => {
    const { actor, filed } = run({ confidence: 0.95, match: exact });
    const state = await settled(actor);
    assert.equal(state.value, "quickReview");
    actor.send({ type: "CONFIRM" });
    await waitFor(actor, (s) => s.value === "finalPrompt");
    assert.deepEqual(
      filed.map((f) => f.itemId),
      ["known"],
      "the matched catalogue item — nothing was created",
    );
  });

  test("high confidence with no match → the form, never the countdown", async () => {
    const { actor } = run({ confidence: 1, match: null });
    assert.equal((await settled(actor)).value, "form");
  });

  test("a near (not exact) match → the form, led by the tap-to-use prompt", async () => {
    const { actor } = run({ confidence: 1, match: { ...exact, exact: false } });
    const state = await settled(actor);
    assert.equal(state.value, "form");
    assert.equal(state.context.catalogMatch?.item.itemId, "known");
  });

  test("outside a cellar an exact match is still only offered", async () => {
    const { actor } = run({ confidence: 1, match: exact, inCellar: false });
    assert.equal((await settled(actor)).value, "form");
  });

  test("Not this one → the form, the item declined", async () => {
    const { actor } = run({ confidence: 1, match: exact });
    await settled(actor);
    actor.send({ type: "EDIT" });
    const state = actor.getSnapshot();
    assert.equal(state.value, "form");
    assert.equal(state.context.catalogMatch, undefined);
    assert.ok(state.context.declinedItemIds.includes("known"));
  });
});
