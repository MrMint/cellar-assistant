/**
 * N07/D25: a feature is hidden only when the server has said it cannot serve
 * it — never while the answer is unknown, never because asking failed.
 *
 *   bun run --filter @cellar-assistant/client test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Client } from "urql";
import {
  type AiCapabilities,
  capabilitiesFrom,
  isOffered,
  offeredBy,
} from "./capabilities.ts";

const caps = (over: Partial<AiCapabilities> = {}): AiCapabilities => ({
  __typename: "AiCapabilities",
  semanticSearch: true,
  imageSearch: false,
  labelRead: true,
  menuScan: true,
  recipePhoto: true,
  tierListInsights: true,
  ...over,
});

/**
 * A client whose every query answers `data`, or throws for `null`. Only
 * `query(…).toPromise()` is used, so that is all it has.
 */
const answering = (data: unknown | null): Client =>
  ({
    query: () => ({
      toPromise: async () => {
        if (data === null) throw new Error("offline");
        return { data };
      },
    }),
  }) as unknown as Client;

describe("isOffered", () => {
  test("offers everything while the answer is unknown", () => {
    assert.equal(isOffered(null, "imageSearch"), true);
  });

  test("hides only what the server said it cannot serve", () => {
    assert.equal(isOffered(caps(), "imageSearch"), false);
    assert.equal(isOffered(caps(), "labelRead"), true);
  });
});

describe("capabilitiesFrom", () => {
  test("is null for a signed-out or empty answer", () => {
    assert.equal(capabilitiesFrom(undefined), null);
    assert.equal(capabilitiesFrom({ me: null }), null);
  });
});

describe("offeredBy", () => {
  test("reads the answer through the client", async () => {
    const client = answering({
      me: { __typename: "Viewer", id: "u", aiCapabilities: caps() },
    });
    assert.equal(await offeredBy(client, "imageSearch"), false);
    assert.equal(await offeredBy(client, "menuScan"), true);
  });

  test("offers the feature when asking fails", async () => {
    assert.equal(await offeredBy(answering(null), "imageSearch"), true);
  });
});
