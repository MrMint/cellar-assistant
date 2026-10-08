/**
 * The "Log a drink" sheet's rules (X02), without a browser: what a tag
 * becomes, when a note is worth asking about, which suggestions still show,
 * what `logDrink` / `updateDrinkLog` are sent, and how an entry reads.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  addTag,
  draftFromEntry,
  EMPTY_DRAFT,
  entryContext,
  joinNames,
  type LogDraft,
  logInput,
  openSuggestions,
  removeTag,
  shouldSuggest,
  toggleId,
  updateInput,
} from "./log-draft";

const subject = {
  itemType: "WINE" as const,
  itemId: "w1",
  itemName: "Barolo",
};

describe("addTag", () => {
  test("normalises the server's way and ignores a duplicate or a blank", () => {
    let tags: readonly string[] = [];
    tags = addTag(tags, "  Dark   Cherry ").tags;
    assert.deepEqual(tags, ["dark cherry"]);
    assert.deepEqual(addTag(tags, "dark cherry").tags, ["dark cherry"]);
    assert.deepEqual(addTag(tags, "   ").tags, ["dark cherry"]);
  });

  test("refuses a sentence and a thirteenth tag with a message, never a throw", () => {
    const long = addTag([], "x".repeat(40));
    assert.equal(long.ok, false);
    const twelve = Array.from({ length: 12 }, (_, i) => `t${i}`);
    const full = addTag(twelve, "one more");
    assert.equal(full.ok, false);
    assert.equal(full.tags, twelve);
    if (!full.ok) assert.match(full.message, /at most 12/);
  });

  test("removeTag and toggleId", () => {
    assert.deepEqual(removeTag(["a", "b"], "a"), ["b"]);
    assert.deepEqual(toggleId(["a"], "b"), ["a", "b"]);
    assert.deepEqual(toggleId(["a", "b"], "a"), ["b"]);
  });
});

describe("shouldSuggest", () => {
  test("needs three letters, and never asks twice about the same note", () => {
    assert.equal(shouldSuggest("ok", null), false);
    assert.equal(shouldSuggest(" !!! ", null), false);
    assert.equal(shouldSuggest("Oaky", null), true);
    assert.equal(shouldSuggest("  OAKY ", "oaky"), false);
    assert.equal(shouldSuggest("oaky, dry", "oaky"), true);
  });

  test("counts letters in any script", () => {
    assert.equal(shouldSuggest("辛口だ", null), true);
  });
});

describe("openSuggestions", () => {
  test("hides what became a tag and what was dismissed", () => {
    const suggestions = [
      { tag: "cherry", evidence: "cherries" },
      { tag: "smoky", evidence: "smoke" },
      { tag: "dry", evidence: "dry" },
    ];
    assert.deepEqual(
      openSuggestions(suggestions, ["cherry"], ["dry"]).map((s) => s.tag),
      ["smoky"],
    );
  });
});

describe("logInput", () => {
  test("an empty draft is just the item: 'I had this, today'", () => {
    assert.deepEqual(logInput(subject, EMPTY_DRAFT), {
      item: { type: "WINE", id: "w1" },
    });
  });

  test("sends only what was given, with the bottle when there is one", () => {
    const draft: LogDraft = {
      score: 3.5,
      note: "  corked  ",
      tags: ["musty"],
      place: { id: "p1", name: "The Corner" },
      companionIds: ["f1"],
      photoFileId: "file1",
    };
    assert.deepEqual(
      logInput(
        { ...subject, bottle: { cellarId: "c1", cellarItemId: "b1" } },
        draft,
      ),
      {
        item: { type: "WINE", id: "w1" },
        bottle: { cellarId: "c1", cellarItemId: "b1" },
        score: 3.5,
        note: "corked",
        tags: ["musty"],
        placeId: "p1",
        photoFileId: "file1",
        companionIds: ["f1"],
      },
    );
  });
});

describe("updateInput", () => {
  const before = draftFromEntry({
    score: 4,
    note: "plum",
    tags: ["plum"],
    place: { id: "p1", name: "Bar", displayName: "The Bar" },
    photo: null,
  });

  test("the entry becomes a draft, the place by its display name", () => {
    assert.deepEqual(before.place, { id: "p1", name: "The Bar" });
    assert.deepEqual(before.companionIds, []);
  });

  test("nothing changed: an empty patch, so the sheet writes nothing", () => {
    assert.deepEqual(updateInput(before, { ...before, note: " plum " }), {});
  });

  test("only what changed; a cleared field is null", () => {
    assert.deepEqual(
      updateInput(before, {
        ...before,
        score: null,
        note: "",
        tags: ["plum", "spice"],
        place: null,
      }),
      { score: null, note: null, tags: ["plum", "spice"], placeId: null },
    );
  });
});

describe("how an entry reads", () => {
  test("joinNames counts everyone who was there, not just the names fetched", () => {
    assert.equal(joinNames(["Sam", "Ana"], 2), "Sam and Ana");
    assert.equal(joinNames(["Sam", "Ana", "Lee"], 4), "Sam, Ana and 2 others");
    assert.equal(
      joinNames(["Sam", "Ana", "Lee", "Kim", "Bo"], 8),
      "Sam, Ana and 6 others",
    );
    assert.equal(joinNames(["Sam", "Ana"], 3), "Sam, Ana and 1 other");
  });

  test("joinNames", () => {
    assert.equal(joinNames([]), "");
    assert.equal(joinNames(["Sam"]), "Sam");
    assert.equal(joinNames(["Sam", "Ana"]), "Sam and Ana");
    assert.equal(joinNames(["Sam", "Ana", "Lee"]), "Sam, Ana and Lee");
    assert.equal(
      joinNames(["Sam", "Ana", "Lee", "Kim"]),
      "Sam, Ana and 2 others",
    );
  });

  test("entryContext: who with, then where; empty when neither", () => {
    assert.equal(
      entryContext({ companionNames: ["Sam"], placeName: "The Corner Bar" }),
      "with Sam · at The Corner Bar",
    );
    assert.equal(
      entryContext({ companionNames: [], placeName: "Home" }),
      "at Home",
    );
    assert.equal(entryContext({ companionNames: [], placeName: null }), "");
  });
});
