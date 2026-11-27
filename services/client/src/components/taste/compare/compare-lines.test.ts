import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AgreementCounts } from "../taste-lines";
import {
  agreementCard,
  compareKinds,
  compareRow,
  compareTile,
  firstName,
} from "./compare-lines";

const counts: AgreementCounts = {
  shared: 13,
  agreed: 12,
  byType: [
    { itemType: "WINE", shared: 8, agreed: 8 },
    { itemType: "SAKE", shared: 1, agreed: null },
    { itemType: "BEER", shared: 2, agreed: 2 },
    { itemType: "TEA", shared: 0, agreed: null },
    { itemType: "SPIRIT", shared: 2, agreed: 1 },
  ],
};

describe("compareKinds", () => {
  test("kit order, Beer first; kinds with none hidden", () => {
    assert.deepEqual(
      compareKinds(counts).map((cell) => `${cell.label} ${cell.count}`),
      ["Beer 2", "Wine 8", "Spirit 2", "Sake 1"],
    );
  });
});

describe("compareTile", () => {
  test("all kinds: the counts and drinks", () => {
    assert.deepEqual(compareTile(counts, null), {
      agreed: 12,
      shared: 13,
      line: "shared drinks agree, within half a star",
    });
  });
  test("one kind names it", () => {
    assert.equal(
      compareTile(counts, "BEER").line,
      "shared beers agree, within half a star",
    );
  });
  test("below the gate it says so, with no number", () => {
    assert.deepEqual(compareTile(counts, "SAKE"), {
      agreed: null,
      shared: 1,
      line: "Not enough sakes in common yet",
    });
  });
});

describe("agreementCard", () => {
  test("a count, never a percentage, and a bar one segment per drink", () => {
    const card = agreementCard(counts);
    assert.equal(card.title, "You agree on 12 of 13");
    assert.equal(card.line, "shared drinks, within half a star");
    assert.equal(card.segments, 13);
    assert.equal(card.filled, 12);
    assert.ok(!/%/.test(card.title + card.line));
  });
  test("below the gate: no bar", () => {
    const card = agreementCard({ shared: 2, agreed: null, byType: [] });
    assert.equal(card.title, "Not enough in common yet");
    assert.equal(card.segments, 0);
  });
});

describe("compareRow", () => {
  const item = {
    __typename: "Spirit",
    id: "s1",
    type: "SPIRIT",
    name: "campari",
  };
  test("a gap over half a star says how far apart", () => {
    const row = compareRow({ myScore: 3.5, theirScore: 2.5, item });
    assert.equal(row?.apart, "1.0 apart");
    assert.equal(row?.itemType, "SPIRIT");
    assert.equal(row?.mine, 3.5);
    assert.equal(row?.theirs, 2.5);
  });
  test("within half a star is agreement: no line", () => {
    assert.equal(
      compareRow({ myScore: 4, theirScore: 4.5, item })?.apart,
      null,
    );
  });
  test("a wine's vintage leads its name", () => {
    const row = compareRow({
      myScore: 4,
      theirScore: 4,
      item: {
        __typename: "Wine",
        id: "w1",
        type: "WINE",
        name: "Bandol Rouge",
        vintage: "2019-01-01",
      },
    });
    assert.match(row?.title ?? "", /^2019 /);
  });
  test("a gone item draws nothing", () => {
    assert.equal(compareRow({ myScore: 4, theirScore: 4, item: null }), null);
  });
});

test("firstName", () => {
  assert.equal(firstName("Test Two"), "Test");
  assert.equal(firstName("Sam"), "Sam");
});
