/**
 * L04 / L16 — the share-image route serves only the signed-in owner, and
 * every refusal answers the same: another user, anonymous, a missing or
 * malformed period, a card past the deck, and an API refusal are one 404,
 * private and uncached, with nothing rendered.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { RecapData } from "./recap-data";
import {
  handleRecapImage,
  PRIVATE_NO_STORE,
  type RecapImageDeps,
  type RecapImageRequest,
} from "./recap-image";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const noStamps = {
  __typename: "BreadthStamps",
  styles: null,
  regions: null,
  types: null,
  recipes: null,
} as const;

const recap: RecapData = {
  __typename: "Recap",
  period: "2026-10",
  timeZone: "UTC",
  totals: { checkIns: 3, ratings: 2, bottlesAdded: 1 },
  cards: {
    newToYou: null,
    types: null,
    styles: null,
    regions: { kind: "REGIONS", count: 6, newCount: 4, chips: ["Jura"] },
    recipes: null,
    topRated: null,
    earned: noStamps,
  },
  stamps: noStamps,
};

const deps = (
  viewer: string | null,
  overrides: Partial<RecapImageDeps> = {},
) => {
  const rendered: unknown[] = [];
  const loads: string[] = [];
  const value: RecapImageDeps = {
    viewerId: async () => viewer,
    loadRecap: async (period) => {
      loads.push(period);
      return recap;
    },
    render: (card) => {
      rendered.push(card);
      return new Response("png", {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    },
    ...overrides,
  };
  return { value, rendered, loads };
};

const request = (
  fields: Partial<RecapImageRequest> = {},
): RecapImageRequest => ({
  owner: OWNER,
  period: "2026-10",
  card: "0",
  timeZone: "Europe/Paris",
  ...fields,
});

const snapshot = async (response: Response) => ({
  status: response.status,
  body: await response.text(),
  type: response.headers.get("content-type"),
  cache: response.headers.get("cache-control"),
});

describe("recap share-image route", () => {
  test("serves the owner their card, private and uncached", async () => {
    const { value, rendered, loads } = deps(OWNER);
    const response = await handleRecapImage(request(), value);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), PRIVATE_NO_STORE);
    assert.equal(rendered.length, 1);
    assert.deepEqual(loads, ["2026-10"]);
  });

  test("another user, anonymous and a missing period answer the same", async () => {
    const cases: Array<[string, string | null, Partial<RecapImageRequest>]> = [
      ["another user", OTHER, {}],
      ["anonymous", null, {}],
      ["missing period", OWNER, { period: undefined }],
      ["malformed period", OWNER, { period: "2026-13" }],
      ["bad time zone", OWNER, { timeZone: "Not/AZone" }],
      ["card past the end card", OWNER, { card: "2" }],
      ["non-numeric card", OWNER, { card: "first" }],
    ];
    const answers = [];
    for (const [name, viewer, fields] of cases) {
      const { value, rendered } = deps(viewer);
      const answer = await snapshot(
        await handleRecapImage(request(fields), value),
      );
      assert.equal(rendered.length, 0, `${name} rendered an image`);
      answers.push(answer);
    }
    for (const answer of answers) {
      assert.deepEqual(answer, {
        status: 404,
        body: "Not found",
        type: "text/plain; charset=utf-8",
        cache: PRIVATE_NO_STORE,
      });
    }
  });

  test("the card after the last is the end card, with the period's totals (SR-5)", async () => {
    const { value, rendered } = deps(OWNER);
    const response = await handleRecapImage(request({ card: "1" }), value);
    assert.equal(response.status, 200);
    assert.deepEqual(rendered, [
      {
        kind: "END",
        stats: [{ value: 6, label: "regions" }],
        totals: { checkIns: 3, ratings: 2, bottlesAdded: 1 },
      },
    ]);
  });

  test("an empty deck has no end card to share: the same 404", async () => {
    const empty: RecapData = {
      ...recap,
      cards: { ...recap.cards, regions: null },
    };
    const { value, rendered } = deps(OWNER, { loadRecap: async () => empty });
    const response = await handleRecapImage(request({ card: "0" }), value);
    assert.equal(response.status, 404);
    assert.equal(rendered.length, 0);
  });

  test("another user never reaches the API read", async () => {
    const { value, loads } = deps(OTHER);
    await handleRecapImage(request(), value);
    assert.deepEqual(loads, []);
  });

  test("an API refusal or failure is the same 404", async () => {
    for (const loadRecap of [
      async () => null,
      async () => {
        throw new Error("down");
      },
    ]) {
      const { value, rendered } = deps(OWNER, { loadRecap });
      const response = await handleRecapImage(request(), value);
      assert.equal(response.status, 404);
      assert.equal(await response.text(), "Not found");
      assert.equal(rendered.length, 0);
    }
  });

  test("a session lookup that throws is the same 404", async () => {
    const { value } = deps(OWNER, {
      viewerId: async () => {
        throw new Error("auth down");
      },
    });
    assert.equal((await handleRecapImage(request(), value)).status, 404);
  });
});

describe("deckOf", () => {
  test("orders the fixed shape, stamps earned last", async () => {
    const { deckOf } = await import("./recap-data");
    const deck = deckOf({
      ...recap,
      cards: {
        ...recap.cards,
        newToYou: { kind: "NEW_TO_YOU", count: 3, newCount: null, chips: [] },
        earned: {
          ...noStamps,
          types: { kind: "TYPES", count: 3, tier: 3 },
        },
      },
    });
    assert.deepEqual(
      deck.map((card) => card.kind),
      ["NEW_TO_YOU", "REGIONS", "STAMP"],
    );
    assert.deepEqual(deck[2]?.stamp, { kind: "TYPES", count: 3, tier: 3 });
  });
});
