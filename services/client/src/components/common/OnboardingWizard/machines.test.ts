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
  CloseOnboardingInput,
  DefaultValuesResult,
  FetchDefaultsInput,
  InsertCellarItemInput,
  RereadLabelsInput,
  RereadLabelsResult,
  SearchByImageInput,
  SearchCatalogInput,
  UploadItemImageInput,
} from "./actors/types";
import { type ExistingItem, formDefaultsFromOnboarding } from "./adapter";
import type { CatalogMatch } from "./catalog-match";
import { OnboardingMachine } from "./machines";

const labelRead = formDefaultsFromOnboarding("WINE", {
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
  addFails = false,
  imageMatches = [] as ExistingItem[] | Error,
  reread = null as RereadLabelsResult | Error | null,
  resumeId = undefined as string | undefined,
  onRestart = undefined as (() => void) | undefined,
  labelSent = undefined as boolean | undefined,
  storedFrontLabel = undefined as string | undefined,
  resumePhoto = undefined as string | undefined,
}) => {
  const filed: InsertCellarItemInput[] = [];
  const closed: CloseOnboardingInput[] = [];
  const photographed: UploadItemImageInput[] = [];
  const searched: SearchCatalogInput[] = [];
  const imageSearched: SearchByImageInput[] = [];
  const reread_: RereadLabelsInput[] = [];
  const read: FetchDefaultsInput[] = [];
  const uploaded: unknown[] = [];
  const pushed: string[] = [];
  const machine = OnboardingMachine.provide({
    actors: {
      searchByImage: fromPromise(
        async ({ input }: { input: SearchByImageInput }) => {
          imageSearched.push(input);
          if (imageMatches instanceof Error) throw imageMatches;
          return imageMatches;
        },
      ),
      rereadLabels: fromPromise(
        async ({ input }: { input: RereadLabelsInput }) => {
          reread_.push(input);
          if (reread instanceof Error) throw reread;
          if (reread === null) throw new Error("no reread fixture");
          return reread;
        },
      ),
      uploadFiles: fromPromise(async ({ input }) => {
        uploaded.push(input);
        return { frontLabelFileId: "front" };
      }),
      fetchDefaults: fromPromise(
        async ({
          input,
        }: {
          input: FetchDefaultsInput;
        }): Promise<DefaultValuesResult> => {
          read.push(input);
          return {
            defaults: labelRead,
            itemOnboardingId: resumeId ?? "onb",
            confidence,
            ...(labelSent === undefined ? {} : { labelSent }),
            ...(storedFrontLabel === undefined
              ? {}
              : { frontLabelFileId: storedFrontLabel }),
          };
        },
      ),
      searchCatalog: fromPromise(
        async ({ input }: { input: SearchCatalogInput }) => {
          searched.push(input);
          return match;
        },
      ),
      insertCellarItem: fromPromise(
        async ({ input }: { input: InsertCellarItemInput }) => {
          if (addFails) throw new Error("refused");
          filed.push(input);
          return { itemId: input.cellarItemId };
        },
      ),
      closeOnboarding: fromPromise(
        async ({ input }: { input: CloseOnboardingInput }) => {
          closed.push(input);
          return true;
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
      navigate: { push: (href: string) => pushed.push(href) },
      cellarId: inCellar ? "cellar-1" : undefined,
      itemType,
      resumeId,
      resumePhoto,
      onRestart,
    },
  });
  actor.start();
  if (resumeId === undefined) {
    actor.send({
      type: "COMPLETE",
      frontLabel: "data:image/jpeg;base64,AA==",
      declinedItemIds: ["declined"],
    });
  }
  return {
    actor,
    filed,
    photographed,
    searched,
    closed,
    imageSearched,
    reread: reread_,
    read,
    uploaded,
    pushed,
  };
};

const settled = (actor: ReturnType<typeof run>["actor"]) =>
  waitFor(
    actor,
    (s) =>
      s.matches("form") ||
      ["quickReview", "finalPrompt", "addFailed"].includes(String(s.value)),
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
    assert.ok(state.matches("form"));
    assert.equal(state.context.catalogMatch, undefined);
  });

  test("a match leads the form; +1 bottle files the known item", async () => {
    const { actor, filed } = run({
      confidence: 0.5,
      match: { ...exact, exact: false },
    });
    const state = await settled(actor);
    assert.ok(state.matches("form"));
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
    assert.ok(state.matches("form"));
    assert.equal(state.context.catalogMatch, undefined);
    assert.deepEqual(state.context.declinedItemIds, ["declined", "known"]);
  });

  test("a failed lookup is the old path to the form", async () => {
    const machine = OnboardingMachine.provide({
      actors: {
        uploadFiles: fromPromise(async () => ({ frontLabelFileId: "f" })),
        fetchDefaults: fromPromise(
          async (): Promise<DefaultValuesResult> => ({
            defaults: labelRead,
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
        navigate: { push: () => {} },
        cellarId: "c",
        itemType: "WINE",
      },
    });
    actor.start();
    actor.send({ type: "COMPLETE", frontLabel: "data:x" });
    const state = await settled(actor);
    assert.ok(state.matches("form"));
  });

  test("a lookup that never answers times out to the form", async () => {
    const machine = OnboardingMachine.provide({
      delays: { catalogMatchTimeout: 20 },
      actors: {
        uploadFiles: fromPromise(async () => ({ frontLabelFileId: "f" })),
        fetchDefaults: fromPromise(
          async (): Promise<DefaultValuesResult> => ({
            defaults: labelRead,
            itemOnboardingId: "onb",
            confidence: 1,
          }),
        ),
        searchCatalog: fromPromise(
          () => new Promise<CatalogMatch | null>(() => {}),
        ),
      },
    });
    const actor = createActor(machine, {
      input: {
        urqlClient: {} as Client,
        navigate: { push: () => {} },
        cellarId: "c",
        itemType: "WINE",
      },
    });
    actor.start();
    actor.send({ type: "COMPLETE", frontLabel: "data:x" });
    const state = await settled(actor);
    assert.ok(state.matches("form"));
    assert.equal(state.context.catalogMatch, undefined);
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
    assert.ok((await settled(actor)).matches("form"));
  });

  test("a near (not exact) match → the form, led by the tap-to-use prompt", async () => {
    const { actor } = run({ confidence: 1, match: { ...exact, exact: false } });
    const state = await settled(actor);
    assert.ok(state.matches("form"));
    assert.equal(state.context.catalogMatch?.item.itemId, "known");
  });

  test("outside a cellar an exact match is still only offered", async () => {
    const { actor } = run({ confidence: 1, match: exact, inCellar: false });
    assert.ok((await settled(actor)).matches("form"));
  });

  test("'No cellar' chosen on the card: CONFIRM uses the match, files no bottle", async () => {
    const { actor, filed, photographed } = run({
      confidence: 0.95,
      match: exact,
    });
    assert.equal((await settled(actor)).value, "quickReview");
    actor.send({ type: "SET_CELLAR", cellarId: null });
    actor.send({ type: "CONFIRM" });
    const state = await waitFor(actor, (s) => s.value === "finalPrompt");
    assert.deepEqual(filed, [], "no cellar, so no bottle");
    assert.deepEqual(
      photographed.map((p) => p.itemId),
      ["known"],
      "the matched item is the result — nothing created",
    );
    assert.equal(state.context.existingItemId, "known");
  });

  test("Not this one → the form, the item declined", async () => {
    const { actor } = run({ confidence: 1, match: exact });
    await settled(actor);
    actor.send({ type: "EDIT" });
    const state = actor.getSnapshot();
    assert.ok(state.matches("form"));
    assert.equal(state.context.catalogMatch, undefined);
    assert.ok(state.context.declinedItemIds.includes("known"));
  });
});

describe("the onboarding is closed when an existing item is filed", () => {
  const closedIds = (closed: CloseOnboardingInput[]) =>
    closed.map((c) => c.itemOnboardingId);

  test("quick-add CONFIRM closes the session analyze opened", async () => {
    const { actor, closed } = run({ confidence: 0.95, match: exact });
    await settled(actor);
    actor.send({ type: "CONFIRM" });
    await waitFor(actor, (s) => s.value === "finalPrompt");
    await waitFor(actor, () => closed.length > 0);
    assert.deepEqual(closedIds(closed), ["onb"]);
  });

  test("+1 bottle closes it, in a cellar or not", async () => {
    for (const inCellar of [true, false]) {
      const { actor, closed } = run({
        confidence: 0.5,
        match: exact,
        inCellar,
      });
      await settled(actor);
      actor.send({ type: "USE_MATCH" });
      await waitFor(actor, (s) => s.value === "finalPrompt");
      await waitFor(actor, () => closed.length > 0);
      assert.deepEqual(closedIds(closed), ["onb"], `inCellar=${inCellar}`);
    }
  });

  test("a created item does not (confirmItemOnboarding closes its own)", async () => {
    const { actor, closed } = run({ confidence: 0.5, match: null });
    await settled(actor);
    actor.send({ type: "CREATED", itemId: "new" });
    await waitFor(actor, (s) => s.value === "finalPrompt");
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(closed, []);
  });

  test("a bottle that failed to file leaves the session open", async () => {
    const { actor, closed } = run({
      confidence: 0.95,
      match: exact,
      addFails: true,
    });
    await settled(actor);
    actor.send({ type: "CONFIRM" });
    await waitFor(actor, (s) => s.value === "addFailed");
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(closed, []);
  });
});

const wineMatch = (itemId: string, name = itemId): ExistingItem => ({
  item: { id: itemId, itemId, name },
  type: "WINE",
});

describe("snap-once (X05): the photo search rides beside the read (G32, D12)", () => {
  test("the shutter's photo is searched, as the type being added, and its matches lead the draft", async () => {
    const { actor, imageSearched, uploaded } = run({
      confidence: 0.5,
      imageMatches: [wineMatch("w1"), wineMatch("declined")],
    });
    await settled(actor);
    await waitFor(actor, (s) => s.context.imageMatches.length > 0);
    assert.equal(imageSearched.length, 1);
    // X06: the search reads the label's own file — one upload, not two.
    assert.equal(uploaded.length, 1);
    assert.equal(imageSearched[0]?.imageFileId, "front");
    assert.equal(imageSearched[0]?.itemType, "WINE");
    // Items declined earlier are not offered again.
    assert.deepEqual(
      actor.getSnapshot().context.imageMatches.map((m) => m.item.itemId),
      ["w1"],
    );
  });

  test("a photo search that fails costs nothing", async () => {
    const { actor } = run({
      confidence: 0.5,
      imageMatches: new Error("IMAGE_SEARCH_UNAVAILABLE"),
    });
    const state = await settled(actor);
    assert.ok(state.matches("form"));
    assert.deepEqual(state.context.imageMatches, []);
    assert.equal(state.status, "active");
  });

  test("a photo match files that item, and the session closes as matched", async () => {
    const { actor, filed, closed } = run({
      confidence: 0.5,
      imageMatches: [wineMatch("w1", "Ridge Lytton Springs")],
    });
    await settled(actor);
    await waitFor(actor, (s) => s.context.imageMatches.length > 0);
    actor.send({ type: "USE_IMAGE_MATCH", item: wineMatch("w1", "Ridge") });
    const state = await waitFor(actor, (s) => s.value === "finalPrompt");
    assert.deepEqual(
      filed.map((f) => f.itemId),
      ["w1"],
    );
    assert.equal(state.context.itemName, "Ridge");
    await waitFor(actor, () => closed.length > 0);
  });

  test("the display photo is the front label (N21), attached from its upload (X06)", async () => {
    const { actor, filed } = run({ confidence: 0.5 });
    await settled(actor);
    actor.send({ type: "CREATED", itemId: "new", name: "New wine" });
    await waitFor(actor, (s) => s.value === "finalPrompt");
    assert.equal(filed[0]?.displayImage, "data:image/jpeg;base64,AA==");
    assert.equal(filed[0]?.displayImageFileId, "front");
  });

  test("a catalogued pick with no cellar attaches the label's file too", async () => {
    const { actor, photographed } = run({
      confidence: 0.5,
      inCellar: false,
      imageMatches: [wineMatch("w1")],
    });
    await settled(actor);
    await waitFor(actor, (s) => s.context.imageMatches.length > 0);
    actor.send({ type: "USE_IMAGE_MATCH", item: wineMatch("w1") });
    await waitFor(actor, (s) => s.value === "finalPrompt");
    assert.equal(photographed[0]?.displayImageFileId, "front");
  });

  test("never creates an item without the person's tap (D25)", async () => {
    // A high-confidence read with no catalogue match waits in the form.
    const { actor, filed } = run({ confidence: 1 });
    const state = await settled(actor);
    assert.ok(state.matches("form"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(filed, []);
  });
});

describe("the optional back label (N21) is a re-read under a new session", () => {
  const backRead = formDefaultsFromOnboarding("WINE", {
    name: "Château Margaux",
    region: "Margaux",
  });

  test("refills the draft, and confirm uses the new session", async () => {
    const { actor, reread } = run({
      confidence: 0.5,
      reread: {
        defaults: backRead,
        itemOnboardingId: "onb-2",
        confidence: 0.8,
        backLabelFileId: "back",
      },
    });
    await settled(actor);
    actor.send({ type: "BACK_LABEL", image: "data:back" });
    assert.ok(actor.getSnapshot().matches({ form: "rereading" }));
    const state = await waitFor(actor, (s) => s.matches({ form: "idle" }));
    assert.equal(reread[0]?.frontLabelFileId, "front");
    assert.equal(reread[0]?.backLabel, "data:back");
    assert.equal(state.context.itemOnboardingId, "onb-2");
    assert.equal(state.context.refill?.id, "onb-2");
    assert.equal(state.context.backLabelFileId, "back");
  });

  test("a refused re-read keeps the first draft and says why", async () => {
    const { actor } = run({
      confidence: 0.5,
      reread: {
        defaults: formDefaultsFromOnboarding("WINE", {}),
        itemOnboardingId: "onb-2",
        confidence: 0,
        backLabelFileId: "back",
        extractionError: {
          kind: "nothing-read",
          title: "Nothing to read",
          message: "…",
          retryAt: null,
          canRetry: false,
          tone: "neutral",
        },
      },
    });
    const first = await settled(actor);
    const id = first.context.itemOnboardingId;
    actor.send({ type: "BACK_LABEL", image: "data:back" });
    const state = await waitFor(
      actor,
      (s) => s.matches({ form: "idle" }) && s.context.rereadError !== undefined,
    );
    assert.equal(state.context.itemOnboardingId, id);
    assert.equal(state.context.refill, undefined);
  });
});

describe("the real ending (N21's success sheet)", () => {
  test("Snap another starts over in place", async () => {
    let restarted = 0;
    const { actor } = run({
      confidence: 0.5,
      onRestart: () => {
        restarted += 1;
      },
    });
    await settled(actor);
    actor.send({ type: "CREATED", itemId: "new" });
    await waitFor(actor, (s) => s.value === "finalPrompt");
    actor.send({ type: "SNAP_ANOTHER" });
    assert.equal(restarted, 1);
    assert.equal(actor.getSnapshot().status, "done");
  });

  test("Open it now shows the bottle's page and uncorks nothing (X06)", async () => {
    const { actor, pushed } = run({ confidence: 0.5 });
    await settled(actor);
    actor.send({ type: "CREATED", itemId: "new" });
    const filed = await waitFor(actor, (s) => s.value === "finalPrompt");
    actor.send({ type: "OPEN_NOW" });
    assert.equal(actor.getSnapshot().status, "done");
    assert.equal(
      pushed[0],
      `/cellars/cellar-1/wines/${filed.context.cellarItemId}`,
    );
  });

  test("no Open it now without a cellar", async () => {
    const { actor, pushed } = run({ confidence: 0.5, inCellar: false });
    await settled(actor);
    actor.send({ type: "CREATED", itemId: "new" });
    await waitFor(actor, (s) => s.value === "finalPrompt");
    actor.send({ type: "OPEN_NOW" });
    assert.equal(actor.getSnapshot().value, "finalPrompt");
    assert.deepEqual(pushed, []);
  });
});

describe("defaults the person can change (X05)", () => {
  test("the cellar can change until the bottle is filed", async () => {
    const { actor, filed } = run({ confidence: 0.5, inCellar: false });
    await settled(actor);
    actor.send({ type: "SET_CELLAR", cellarId: "home" });
    actor.send({ type: "CREATED", itemId: "new" });
    await waitFor(actor, (s) => s.value === "finalPrompt");
    assert.equal(filed[0]?.cellarId, "home");
  });

  test("a barcode-chooser pick of another type files under that type", async () => {
    const { actor, filed } = run({ confidence: 0.5, resumeId: "x" });
    await settled(actor);
    // A fresh run, choosing at the capture step.
    const fresh = createActor(
      OnboardingMachine.provide({
        actors: {
          insertCellarItem: fromPromise(
            async ({ input }: { input: InsertCellarItemInput }) => {
              filed.push(input);
              return { itemId: input.cellarItemId };
            },
          ),
        },
      }),
      {
        input: {
          urqlClient: {} as Client,
          navigate: { push: () => {} },
          cellarId: "c",
          itemType: "WINE",
        },
      },
    ).start();
    fresh.send({
      type: "COMPLETE",
      existingItemId: "beer-1",
      existingItemType: "BEER",
      existingItemName: "Spotted Cow",
    });
    const state = await waitFor(fresh, (s) => s.value === "finalPrompt");
    assert.equal(state.context.itemType, "BEER");
    assert.equal(filed.at(-1)?.itemType, "BEER");
    assert.equal(state.context.itemName, "Spotted Cow");
  });
});

describe("background continuation (X05): a resumed draft", () => {
  test("opens on the read under the same session, without a photo upload", async () => {
    const { actor, read, uploaded } = run({
      confidence: 0.5,
      resumeId: "onb-left",
      labelSent: true,
    });
    const state = await settled(actor);
    assert.ok(state.matches("form"));
    assert.deepEqual(uploaded, []);
    assert.equal(read[0]?.itemOnboardingId, "onb-left");
    assert.equal(state.context.labelSent, true);
  });

  test("after a full reload, the session's label file is its photo (X06)", async () => {
    const { actor, filed, imageSearched, uploaded } = run({
      confidence: 0.5,
      resumeId: "onb-left",
      labelSent: true,
      storedFrontLabel: "stored-front",
    });
    const state = await settled(actor);
    assert.deepEqual(uploaded, []);
    assert.equal(state.context.frontLabelFileId, "stored-front");
    assert.equal(state.context.displayImageFileId, "stored-front");
    await waitFor(actor, () => imageSearched.length > 0);
    assert.equal(imageSearched[0]?.imageFileId, "stored-front");
    actor.send({ type: "CREATED", itemId: "new" });
    await waitFor(actor, (s) => s.value === "finalPrompt");
    assert.equal(filed[0]?.displayImageFileId, "stored-front");
    assert.equal(filed[0]?.displayImage, undefined);
  });

  test("a resume that still holds its capture keeps it as the display photo", async () => {
    const { actor } = run({
      confidence: 0.5,
      resumeId: "onb-left",
      storedFrontLabel: "stored-front",
      resumePhoto: "data:held",
    });
    const state = await settled(actor);
    assert.equal(state.context.displayImageDataUrl, "data:held");
    assert.equal(state.context.displayImageFileId, "stored-front");
  });
});
