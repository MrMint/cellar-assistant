import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { MenuLineForYou } from "@/components/map/adapter";
import {
  candidateQuery,
  friendsLovedText,
  groupMenuLines,
  lineItemType,
  type MenuLineShape,
  menuGroupOf,
  menuLineReasons,
  starText,
} from "./menu-lines";

const NO_REASONS: MenuLineForYou = {
  your_score: null,
  cellar: null,
  friends_who_loved: [],
  friends_who_loved_count: 0,
  like_you_rated: null,
};

const line = (
  id: string,
  detected: string | null,
  extra: Partial<MenuLineShape> = {},
): MenuLineShape => ({
  id,
  menu_item_name: id,
  detected_item_type: detected,
  matched_item: null,
  search_name: null,
  for_you: null,
  ...extra,
});

describe("menuGroupOf", () => {
  test("groups by the detected type when menu_category is absent — not all under Other", () => {
    assert.equal(menuGroupOf(line("a", "wine")), "WINE");
    assert.equal(menuGroupOf(line("b", "sake")), "SAKE");
    assert.equal(menuGroupOf(line("c", "tea")), "TEA");
    assert.equal(menuGroupOf(line("d", "cocktail")), "COCKTAIL");
    assert.equal(menuGroupOf(line("e", "unknown")), "OTHER");
    assert.equal(menuGroupOf(line("f", null)), "OTHER");
  });

  test("a matched item's type wins over the read's guess", () => {
    const matched = line("g", "unknown", {
      matched_item: {
        id: "s",
        name: "Kubota",
        type: "sake",
        is_want_to_try: false,
      },
    });
    assert.equal(menuGroupOf(matched), "SAKE");
    assert.equal(lineItemType(matched), "SAKE");
  });

  test("a cocktail is no item type: it matches recipes", () => {
    assert.equal(lineItemType(line("h", "cocktail")), null);
    assert.equal(lineItemType(line("i", "BEER")), "BEER");
  });
});

describe("groupMenuLines", () => {
  test("groups in the app's type order, cocktails beside spirits, Other last", () => {
    const groups = groupMenuLines([
      line("tea", "tea"),
      line("other", null),
      line("negroni", "cocktail"),
      line("barolo", "wine"),
      line("rye", "spirit"),
      line("ipa", "beer"),
      line("junmai", "sake"),
      line("flat white", "coffee"),
    ]);
    assert.deepEqual(
      groups.map((group) => group.label),
      [
        "Wine",
        "Beer",
        "Spirits",
        "Cocktails",
        "Sake",
        "Coffee",
        "Tea",
        "Other",
      ],
    );
  });

  test("lines with a reason for you lead their group; the rest keep the menu's order", () => {
    const [wine] = groupMenuLines([
      line("first", "wine"),
      line("second", "wine"),
      line("loved", "wine", {
        for_you: { ...NO_REASONS, your_score: 4.5 },
      }),
      line("third", "wine"),
    ]);
    assert.deepEqual(
      wine?.lines.map((l) => l.id),
      ["loved", "first", "second", "third"],
    );
  });
});

describe("menuLineReasons", () => {
  test("every reason is a fact in words, strongest first", () => {
    const reasons = menuLineReasons(
      line("x", "spirit", {
        matched_item: {
          id: "s",
          name: "Laphroaig 10",
          type: "spirit",
          is_want_to_try: true,
        },
        for_you: {
          your_score: 4.5,
          cellar: { id: "c", name: "Bar Cart" },
          friends_who_loved: ["Sam"],
          friends_who_loved_count: 1,
          like_you_rated: { name: "Lagavulin 16", score: 4 },
        },
      }),
    );
    assert.deepEqual(
      reasons.map((r) => r.label),
      [
        "In Bar Cart",
        "You ★4.5",
        "Sam loved it",
        "Like the Lagavulin 16 you rated ★4",
        "On Want to try",
      ],
    );
  });

  test("no reasons, no chips — and never a percentage", () => {
    assert.deepEqual(
      menuLineReasons(line("y", "wine", { for_you: NO_REASONS })),
      [],
    );
    const all = menuLineReasons(
      line("z", "wine", {
        for_you: {
          ...NO_REASONS,
          like_you_rated: { name: "Barolo", score: 5 },
          friends_who_loved: ["Sam", "Kim"],
          friends_who_loved_count: 7,
        },
      }),
    );
    for (const reason of all) assert.doesNotMatch(reason.label, /%/);
  });
});

describe("friendsLovedText", () => {
  test("names who it can, counts the rest", () => {
    assert.equal(friendsLovedText([], 0), null);
    assert.equal(friendsLovedText(["Sam"], 1), "Sam loved it");
    assert.equal(friendsLovedText(["Sam", "Kim"], 2), "Sam and Kim loved it");
    assert.equal(
      friendsLovedText(["Sam", "Kim", "Lee"], 3),
      "Sam and 2 friends loved it",
    );
    assert.equal(friendsLovedText(["Sam"], 2), "Sam and 1 friend loved it");
    assert.equal(friendsLovedText([], 3), "3 friends loved it");
  });
});

describe("starText / candidateQuery", () => {
  test("half stars without a trailing zero", () => {
    assert.equal(starText(4), "4");
    assert.equal(starText(4.5), "4.5");
  });
  test("the pipeline's search name first, else the line's own words, cased", () => {
    assert.equal(
      candidateQuery(line("LAGAVULIN 16", "spirit")),
      "Lagavulin 16",
    );
    assert.equal(
      candidateQuery(
        line("LAGAVULIN 16YR", "spirit", { search_name: "lagavulin 16" }),
      ),
      "lagavulin 16",
    );
  });
});
