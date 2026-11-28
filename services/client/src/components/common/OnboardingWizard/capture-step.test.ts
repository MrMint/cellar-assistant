/**
 * The capture step, snap-once (X05): one live camera; a barcode read off the
 * picture is looked up while you frame the label; the shutter ends the step
 * at once, so the read starts there. The lookup is stubbed — what is
 * asserted is the routing, and what the step hands on.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Client } from "urql";
import { createActor, fromPromise, waitFor } from "xstate";
import type { SearchByBarcodeInput } from "./actors/types";
import type { ExistingItem } from "./adapter";
import type { OnboardingResult } from "./index";
import { pictureOnboardingMachine } from "./machines";

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});

const known: ExistingItem = {
  item: { id: "b1", itemId: "b1", name: "Spotted Cow" },
  type: "BEER",
};
const code = { text: "0123456789012", type: "EAN_13" } as const;

const step = (
  found: ExistingItem[] | Error | "never",
  done: OnboardingResult[] = [],
  seen: SearchByBarcodeInput[] = [],
) =>
  createActor(
    pictureOnboardingMachine.provide({
      actors: {
        searchByBarcode: fromPromise(
          ({ input }: { input: SearchByBarcodeInput }) => {
            seen.push(input);
            if (found === "never") return new Promise<ExistingItem[]>(() => {});
            if (found instanceof Error) return Promise.reject(found);
            return Promise.resolve(found);
          },
        ),
      },
      actions: {
        handleDone: ({ context }) => {
          done.push({
            barcode: context.barcode,
            frontLabelDataUrl: context.frontLabelDataUrl,
            displayImageDataUrl: context.displayImageDataUrl,
            existingItemId: context.chosen?.item.itemId,
            existingItemType: context.chosen?.type,
            declinedItemIds: context.declinedItemIds,
          });
        },
      },
    }),
    { input: { urqlClient: client, itemType: "WINE" } },
  ).start();

describe("capture step (X05: one camera, the read starts at the shutter)", () => {
  test("the shutter is the front label and ends the step", () => {
    const done: OnboardingResult[] = [];
    const actor = step([], done);
    assert.equal(actor.getSnapshot().value, "framing");
    actor.send({ type: "CAPTURED", image: "data:front" });
    assert.equal(actor.getSnapshot().status, "done");
    assert.equal(done[0]?.frontLabelDataUrl, "data:front");
    assert.equal(done[0]?.existingItemId, undefined);
  });

  test("a barcode nobody knows rides along with the photo", async () => {
    const done: OnboardingResult[] = [];
    const seen: SearchByBarcodeInput[] = [];
    const actor = step([], done, seen);
    actor.send({ type: "BARCODE", barcode: code });
    await waitFor(actor, (s) => s.value === "framing");
    assert.equal(seen[0]?.barcode?.text, code.text);
    actor.send({ type: "CAPTURED", image: "data:front" });
    assert.equal(done[0]?.barcode?.text, code.text);
  });

  test("a known barcode offers its items; picking one asks only for a photo", async () => {
    const done: OnboardingResult[] = [];
    const actor = step([known], done);
    actor.send({ type: "BARCODE", barcode: code });
    await waitFor(actor, (s) => s.value === "chooseExisting");
    actor.send({ type: "CHOOSE_ITEM", item: known });
    assert.equal(actor.getSnapshot().value, "photo");
    actor.send({ type: "CAPTURED", image: "data:bottle" });
    assert.equal(done[0]?.existingItemId, "b1");
    assert.equal(done[0]?.existingItemType, "BEER");
    assert.equal(done[0]?.displayImageDataUrl, "data:bottle");
    assert.equal(done[0]?.frontLabelDataUrl, undefined);
  });

  test("the chosen item's photo can be skipped", async () => {
    const done: OnboardingResult[] = [];
    const actor = step([known], done);
    actor.send({ type: "BARCODE", barcode: code });
    await waitFor(actor, (s) => s.value === "chooseExisting");
    actor.send({ type: "CHOOSE_ITEM", item: known });
    actor.send({ type: "SKIP" });
    assert.equal(done[0]?.existingItemId, "b1");
    assert.equal(done[0]?.displayImageDataUrl, undefined);
  });

  test("None of these: back to framing, those items declined", async () => {
    const done: OnboardingResult[] = [];
    const actor = step([known], done);
    actor.send({ type: "BARCODE", barcode: code });
    await waitFor(actor, (s) => s.value === "chooseExisting");
    actor.send({ type: "SKIP" });
    assert.equal(actor.getSnapshot().value, "framing");
    actor.send({ type: "CAPTURED", image: "data:front" });
    assert.deepEqual(done[0]?.declinedItemIds, ["b1"]);
    assert.equal(done[0]?.frontLabelDataUrl, "data:front");
  });

  test("the shutter wins over a lookup still in flight", () => {
    const done: OnboardingResult[] = [];
    const actor = step("never", done);
    actor.send({ type: "BARCODE", barcode: code });
    assert.equal(actor.getSnapshot().value, "searching");
    actor.send({ type: "CAPTURED", image: "data:front" });
    assert.equal(done[0]?.frontLabelDataUrl, "data:front");
  });

  test("a lookup that fails is one that found nothing", async () => {
    const actor = step(new Error("network"));
    actor.send({ type: "BARCODE", barcode: code });
    await waitFor(actor, (s) => s.value === "framing");
  });

  test("Type it in instead ends the step with no photo", () => {
    const done: OnboardingResult[] = [];
    const actor = step([], done);
    actor.send({ type: "MANUAL" });
    assert.equal(done[0]?.frontLabelDataUrl, undefined);
  });
});
