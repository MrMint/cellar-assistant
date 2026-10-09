/**
 * The "Log a drink" sheet's rules (X02), without a browser: what a tag
 * becomes, when a note is worth asking about, which suggestions still show,
 * what `logDrink` / `updateDrinkLog` are sent, and how an entry reads.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  addTag,
  companionsChanged,
  draftFromEntry,
  drankAtProblem,
  EMPTY_DRAFT,
  entryContext,
  fromLocalInputValue,
  joinNames,
  type LogDraft,
  logInput,
  openSuggestions,
  removeTag,
  shouldSuggest,
  toggleId,
  toLocalInputValue,
  updateInput,
  whenLabel,
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
      drankAt: "2026-10-01T18:00:00.000Z",
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
        drankAt: "2026-10-01T18:00:00.000Z",
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
    createdAt: "2026-10-01T18:00:00.000Z",
    companionIds: ["f1"],
  });

  test("the entry becomes a draft: the place by its display name, its time and table", () => {
    assert.deepEqual(before.place, { id: "p1", name: "The Bar" });
    assert.deepEqual(before.companionIds, ["f1"]);
    assert.equal(before.drankAt, "2026-10-01T18:00:00.000Z");
  });

  test("re-dating is a patch; companions are not — they have their own call", () => {
    assert.deepEqual(
      updateInput(before, {
        ...before,
        drankAt: "2026-09-30T20:00:00.000Z",
        companionIds: [],
      }),
      { drankAt: "2026-09-30T20:00:00.000Z" },
    );
    assert.equal(companionsChanged(["a", "b"], ["b", "a"]), false);
    assert.equal(companionsChanged(["a"], ["a", "b"]), true);
    assert.equal(companionsChanged(["a", "b"], ["a"]), true);
    assert.equal(companionsChanged([], []), false);
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

describe("when", () => {
  const now = new Date(2026, 9, 8, 21, 30);

  test("the picker's local wall clock round-trips to the instant", () => {
    const at = new Date(2026, 9, 4, 19, 5);
    assert.equal(toLocalInputValue(at), "2026-10-04T19:05");
    assert.equal(fromLocalInputValue("2026-10-04T19:05"), at.toISOString());
    assert.equal(fromLocalInputValue(""), null);
    assert.equal(fromLocalInputValue("yesterday"), null);
  });

  test("the server's rule, said before the tap", () => {
    assert.equal(drankAtProblem(null, now), null);
    assert.equal(
      drankAtProblem(new Date(2026, 9, 8, 20).toISOString(), now),
      null,
    );
    assert.match(
      drankAtProblem(new Date(2026, 9, 9, 21).toISOString(), now) ?? "",
      /future/,
    );
    assert.match(drankAtProblem("1850-01-01T00:00:00Z", now) ?? "", /1900/);
  });

  test("the chip says Now, Today, Yesterday, or the day", () => {
    assert.equal(whenLabel(null, now, "en-GB"), "Now");
    assert.equal(
      whenLabel(new Date(2026, 9, 8, 19, 30).toISOString(), now, "en-GB"),
      "Today, 19:30",
    );
    assert.equal(
      whenLabel(new Date(2026, 9, 7, 21, 5).toISOString(), now, "en-GB"),
      "Yesterday, 21:05",
    );
    assert.match(
      whenLabel(new Date(2026, 9, 4, 19, 30).toISOString(), now, "en-GB"),
      /^Sun 4 Oct, 19:30$/,
    );
    assert.match(
      whenLabel(new Date(2025, 9, 4, 19, 30).toISOString(), now, "en-GB"),
      /2025/,
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
