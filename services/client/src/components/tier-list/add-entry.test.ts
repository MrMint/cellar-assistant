/**
 * X16's client rules as data: what each section is called, why a row is
 * offered, how picks toggle, what the toast says, and why a Try this next
 * card is there — never a score or a percentage.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  type AddEntryCandidate,
  addButtonLabel,
  addedMessage,
  type SuggestionNode,
  sectionTitle,
  suggestionReason,
  suggestionSections,
  togglePick,
  tryNextReason,
} from "./add-entry";
import { defaultListName, ratedSummary } from "./TierListForm";

const wine = (
  id: string,
  over: Partial<SuggestionNode> = {},
): SuggestionNode => ({
  section: "TASTED",
  entryType: "WINE",
  myScore: null,
  cellarName: null,
  bottleCount: null,
  logCount: null,
  friendBand: null,
  friendCount: null,
  friend: null,
  place: null,
  item: {
    id,
    name: `WINE ${id.toUpperCase()}`,
    type: "WINE",
    country: "ITALY",
    wineVariety: "NEBBIOLO",
    wineVintage: "2016-01-01",
    beerStyle: null,
    spiritKind: null,
    sakeCategory: null,
    sakeRegion: null,
    teaCategory: null,
    teaRegion: null,
  },
  ...over,
});

describe("sections", () => {
  test("titles, with a place list's own words for tasted", () => {
    assert.equal(sectionTitle("IN_CELLARS", "wine"), "In your cellars");
    assert.equal(sectionTitle("TASTED", "wine"), "Tasted, not ranked");
    assert.equal(sectionTitle("TASTED", "place"), "Been there, not ranked");
    assert.equal(sectionTitle("FRIENDS_RANKED", "beer"), "Friends ranked");
  });

  test("groups nodes in the sheet's order, with a reason and a formatted name", () => {
    const sections = suggestionSections(
      [
        wine("b", {
          section: "FRIENDS_RANKED",
          friend: { displayName: "Riley" },
          friendBand: 5,
          friendCount: 3,
        }),
        wine("a", {
          section: "IN_CELLARS",
          cellarName: "Garage",
          bottleCount: 2,
          myScore: 4,
        }),
        wine("c", { section: "TASTED", logCount: 2 }),
        wine("x", { section: "SOMETHING_NEW" }),
        { ...wine("d"), item: null },
      ],
      "wine",
    );
    assert.deepEqual(
      sections.map(({ section, rows }) => [
        section,
        rows.map((row) => [row.id, row.reason]),
      ]),
      [
        ["IN_CELLARS", [["a", "In Garage · 2 bottles"]]],
        ["TASTED", [["c", "Logged twice"]]],
        ["FRIENDS_RANKED", [["b", "Riley: Outstanding · +2 friends"]]],
      ],
    );
    const [first] = sections[0]?.rows ?? [];
    assert.equal(first?.name, "Wine A");
    assert.equal(first?.myScore, 4);
    assert.match(first?.subtitle ?? "", /Nebbiolo · 2016 · Italy/);
  });

  test("a node of another type is not drawn on this list", () => {
    assert.deepEqual(suggestionSections([wine("a")], "beer"), []);
  });
});

describe("suggestionReason", () => {
  test("cellar rows: where it is, how many, or finished", () => {
    assert.equal(
      suggestionReason(
        { section: "IN_CELLARS", cellarName: "Rack", bottleCount: 1 },
        "wine",
      ),
      "In Rack",
    );
    assert.equal(
      suggestionReason(
        { section: "IN_CELLARS", cellarName: "Rack", bottleCount: 0 },
        "wine",
      ),
      "Finished · Rack",
    );
  });

  test("tasted rows: logged counts, rated, and a place's words", () => {
    assert.equal(
      suggestionReason({ section: "TASTED", logCount: 0 }, "wine"),
      "Rated",
    );
    assert.equal(
      suggestionReason({ section: "TASTED", logCount: 1 }, "wine"),
      "Logged once",
    );
    assert.equal(
      suggestionReason({ section: "TASTED", logCount: 5 }, "wine"),
      "Logged 5 times",
    );
    assert.equal(
      suggestionReason({ section: "TASTED", logCount: 0 }, "place"),
      "You've been",
    );
    assert.equal(
      suggestionReason({ section: "TASTED", logCount: 2 }, "place"),
      "Drank here twice",
    );
  });

  test("friends' rows name the friend and their band, never a percentage", () => {
    const reason = suggestionReason(
      {
        section: "FRIENDS_RANKED",
        friendName: "Sam",
        friendBand: 4,
        friendCount: 2,
      },
      "wine",
    );
    assert.equal(reason, "Sam: Very Good · +1 friend");
    assert.doesNotMatch(reason, /%/);
  });
});

describe("picking several", () => {
  const row = (
    id: string,
    myScore: number | null = null,
  ): AddEntryCandidate => ({
    id,
    entityType: "wine",
    name: `Wine ${id}`,
    subtitle: "",
    myScore,
  });

  test("a tap picks, a second tap unpicks; the order picked is kept", () => {
    let picks = togglePick(new Map(), row("a"));
    picks = togglePick(picks, row("b"));
    picks = togglePick(picks, row("a"));
    picks = togglePick(picks, row("c"));
    assert.deepEqual(
      Array.from(picks.values()).map((r) => r.id),
      ["b", "c"],
    );
  });

  test("the footer says how many", () => {
    assert.equal(addButtonLabel(0), "Pick what to add");
    assert.equal(addButtonLabel(1), "Add 1 entry");
    assert.equal(addButtonLabel(4), "Add 4 entries");
  });

  test("the toast names one, counts several, and says what was passed over", () => {
    assert.equal(
      addedMessage([row("a", 4.5)], 1, 0),
      "Added Wine a to Outstanding",
    );
    assert.equal(addedMessage([row("a"), row("b")], 2, 0), "Added 2 entries");
    assert.equal(
      addedMessage([row("a"), row("b")], 1, 1),
      "Added 1 entry · 1 was already on it",
    );
    assert.equal(addedMessage([row("a")], 0, 1), "Already on this list");
  });
});

describe("tryNextReason", () => {
  test("a friend's pick, with how many more friends agree", () => {
    assert.equal(
      tryNextReason(
        {
          reason: "FRIEND_RANKED",
          friendName: "Riley",
          friendBand: 5,
          friendCount: 1,
        },
        true,
      ),
      "Riley ranks it Outstanding",
    );
    assert.equal(
      tryNextReason(
        {
          reason: "FRIEND_RANKED",
          friendName: "Riley",
          friendBand: 4,
          friendCount: 3,
        },
        true,
      ),
      "Riley ranks it Very Good, as do 2 more friends",
    );
  });

  test("like this list's top entry — worded for the owner and for a visitor", () => {
    const facts = {
      reason: "LIKE_TOP",
      likeName: "BAROLO CANNUBI",
      likeBand: 5,
    };
    assert.equal(
      tryNextReason(facts, true),
      "Like Barolo Cannubi, which you ranked Outstanding",
    );
    assert.equal(
      tryNextReason(facts, false),
      "Like Barolo Cannubi, ranked Outstanding here",
    );
  });

  test("like a love; an unexplainable card is dropped", () => {
    assert.equal(
      tryNextReason({ reason: "LIKE_LOVED", likeName: "Lagavulin 16" }, false),
      "Like Lagavulin 16, which you love",
    );
    assert.equal(
      tryNextReason({ reason: "LIKE_LOVED", likeName: null }, true),
      null,
    );
    assert.equal(tryNextReason({ reason: "SOMETHING_NEW" }, true), null);
  });
});

describe("templates on the create form", () => {
  test("an unnamed list takes its type's name", () => {
    assert.equal(defaultListName("wine"), "My wines");
    assert.equal(defaultListName("place"), "My places");
    assert.equal(defaultListName("cars"), "");
  });

  test("says how many it would start with", () => {
    assert.equal(ratedSummary("wine", 12), "12 wines you've rated");
    assert.equal(ratedSummary("place", 1), "1 place you've rated");
    assert.equal(ratedSummary("sake", 3), "3 sake you've rated");
  });
});
