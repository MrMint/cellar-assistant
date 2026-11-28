/**
 * F-227 · the kind follows the shot. The label read says which kind the
 * label is for (`detectedItemType`, F-77); when that differs from the kind
 * the person had picked, the label is read again as the detected kind, in a
 * session of its own, and the wizard goes on as that kind. A session stored
 * before F-77 answers `detectedItemType: null` and changes nothing.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Client } from "urql";
import { readDefaults } from "./actors/fetchDefaults";
import { formDefaultsFromOnboarding } from "./adapter";

const FIRST = "00000000-0000-4000-8000-000000000001";
const LABEL = "00000000-0000-4000-8000-000000000002";

type Start = { onboardingId: string; input: Record<string, unknown> };

const session = (
  id: string,
  itemType: string,
  detectedItemType: string | null,
  defaults: Record<string, unknown> | null,
) => ({
  __typename: "ItemOnboarding",
  id,
  itemType,
  status: "COMPLETED",
  defaults,
  confidence: defaults === null ? 0 : 0.9,
  barcode: null,
  barcodeType: null,
  frontLabelImageId: LABEL,
  backLabelImageId: null,
  aiModel: "m",
  userId: "u1",
  createdAt: "2026-11-27T00:00:00Z",
  updatedAt: "2026-11-27T00:00:00Z",
  cellarId: null,
  draftFields: null,
  detectedItemType,
});

/** Answers each start by the kind it asks for. */
const stub = (detected: string | null) => {
  const starts: Start[] = [];
  const client = {
    mutation: (_document: unknown, variables: Start) => {
      starts.push(variables);
      const kind = String(variables.input.itemType);
      const answer =
        kind === "WINE"
          ? session(variables.onboardingId, "WINE", detected, {})
          : session(variables.onboardingId, kind, kind, {
              name: "Harbour Pale",
            });
      return {
        toPromise: async () => ({ data: { startItemOnboarding: answer } }),
      };
    },
  } as unknown as Client;
  return { client, starts };
};

const read = (client: Client, resumed = false) =>
  readDefaults({
    urqlClient: client,
    itemType: "WINE",
    itemOnboardingId: FIRST,
    frontLabelFileId: LABEL,
    resumed,
  });

describe("readDefaults: the kind follows the shot (F-227)", () => {
  test("a label read as another kind is read again as that kind", async () => {
    const { client, starts } = stub("BEER");
    const result = await read(client);
    assert.equal(starts.length, 2);
    assert.equal(starts[1]?.input.itemType, "BEER");
    assert.equal(starts[1]?.input.frontLabelImageId, LABEL);
    assert.notEqual(starts[1]?.onboardingId, FIRST, "a session of its own");
    assert.equal(result.itemType, "BEER");
    assert.equal(result.itemOnboardingId, starts[1]?.onboardingId);
    assert.deepEqual(
      result.defaults,
      formDefaultsFromOnboarding("BEER", { name: "Harbour Pale" }),
      "the beer read's defaults, as a beer",
    );
  });

  test("an older session (no detected kind) keeps the picked kind", async () => {
    const { client, starts } = stub(null);
    const result = await read(client);
    assert.equal(starts.length, 1);
    assert.equal(result.itemType, undefined);
    assert.equal(result.itemOnboardingId, FIRST);
  });

  test("the same kind detected reads once", async () => {
    const { client, starts } = stub("WINE");
    const result = await read(client);
    assert.equal(starts.length, 1);
    assert.equal(result.itemType, undefined);
  });

  test("a saved draft being finished keeps its kind", async () => {
    const { client, starts } = stub("BEER");
    const result = await read(client, true);
    assert.equal(starts.length, 1);
    assert.equal(result.itemType, undefined);
  });
});
