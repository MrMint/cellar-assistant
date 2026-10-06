/**
 * The onboarding wizard's display-photo match (G32) —
 * `82450ad1:src/components/common/OnboardingWizard/machines.ts` 475-521,
 * restored: `display` → `searchingByImage` → `chooseExistingImage` | `done`.
 *
 * The search itself is stubbed (`searchByImage` uploads and queries); what is
 * asserted is the old machine's routing, plus the one narrowing this restore
 * adds — the search is told the type being added.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Client } from "urql";
import { createActor, fromPromise, waitFor } from "xstate";
import type { SearchByImageInput } from "./actors/types";
import type { ExistingItem } from "./adapter";
import { pictureOnboardingMachine } from "./machines";

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});

const match = { item: { id: "w1" }, type: "WINE" } as unknown as ExistingItem;

const wizard = (
  found: ExistingItem[] | Error,
  seen: SearchByImageInput[] = [],
  done: string[] = [],
) =>
  createActor(
    pictureOnboardingMachine.provide({
      actors: {
        searchByImage: fromPromise(
          async ({ input }: { input: SearchByImageInput }) => {
            seen.push(input);
            if (found instanceof Error) throw found;
            return found;
          },
        ),
      },
      actions: {
        handleDone: ({ context }) => {
          done.push(context.existingItemId ?? "new");
        },
      },
    }),
    { input: { urqlClient: client, itemType: "WINE" } },
  ).start();

/** Skip barcode and both labels, landing on the display-photo step. */
const toDisplay = async (actor: ReturnType<typeof wizard>) => {
  actor.send({ type: "SKIP" });
  await waitFor(actor, (state) => state.value === "back");
  actor.send({ type: "SKIP" });
  actor.send({ type: "SKIP" });
  assert.equal(actor.getSnapshot().value, "display");
};

describe("pictureOnboardingMachine — the display-photo match (G32)", () => {
  test("a photo of a new item is searched, as the type being added, and matches are offered", async () => {
    const seen: SearchByImageInput[] = [];
    const actor = wizard([match], seen);
    await toDisplay(actor);
    actor.send({ type: "CAPTURED", image: "data:image/jpeg;base64,AAAA" });
    await waitFor(actor, (state) => state.value === "chooseExistingImage");
    assert.deepEqual(actor.getSnapshot().context.existingItems, [match]);
    assert.equal(seen[0]?.displayImage, "data:image/jpeg;base64,AAAA");
    assert.equal(seen[0]?.itemType, "WINE");
  });

  test("choosing a match finishes with that item; skipping finishes as new", async () => {
    const done: string[] = [];
    const chooser = wizard([match], [], done);
    await toDisplay(chooser);
    chooser.send({ type: "CAPTURED", image: "data:image/jpeg;base64,AAAA" });
    await waitFor(chooser, (state) => state.value === "chooseExistingImage");
    chooser.send({ type: "CHOOSE_ITEM", existingItemId: "w1" });
    assert.equal(chooser.getSnapshot().value, "done");

    const skipper = wizard([match], [], done);
    await toDisplay(skipper);
    skipper.send({ type: "CAPTURED", image: "data:image/jpeg;base64,AAAA" });
    await waitFor(skipper, (state) => state.value === "chooseExistingImage");
    skipper.send({ type: "SKIP" });
    assert.equal(skipper.getSnapshot().value, "done");
    assert.deepEqual(done, ["w1", "new"]);
  });

  test("no match, or a search that failed (photo search unavailable), finishes with the photo kept", async () => {
    for (const found of [[], new Error("IMAGE_SEARCH_UNAVAILABLE")] as const) {
      const actor = wizard(found instanceof Error ? found : [...found]);
      await toDisplay(actor);
      actor.send({ type: "CAPTURED", image: "data:image/jpeg;base64,AAAA" });
      await waitFor(actor, (state) => state.value === "done");
      assert.equal(
        actor.getSnapshot().context.displayImageDataUrl,
        "data:image/jpeg;base64,AAAA",
      );
    }
  });

  test("a photo of an item already chosen by barcode is its display image, not searched", async () => {
    const seen: SearchByImageInput[] = [];
    const actor = createActor(
      pictureOnboardingMachine.provide({
        actors: {
          searchByBarcode: fromPromise(async () => [match]),
          searchByImage: fromPromise(
            async ({ input }: { input: SearchByImageInput }) => {
              seen.push(input);
              return [match];
            },
          ),
        },
        actions: { handleDone: () => {} },
      }),
      { input: { urqlClient: client, itemType: "WINE" } },
    ).start();
    actor.send({ type: "FOUND", barcode: { text: "5012345678900" } as never });
    await waitFor(actor, (state) => state.value === "chooseExisting");
    actor.send({ type: "CHOOSE_ITEM", existingItemId: "w1" });
    assert.equal(actor.getSnapshot().value, "display");
    actor.send({ type: "CAPTURED", image: "data:image/jpeg;base64,AAAA" });
    assert.equal(actor.getSnapshot().value, "done");
    assert.deepEqual(seen, []);
  });
});
