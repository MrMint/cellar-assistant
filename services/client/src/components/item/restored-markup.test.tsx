/**
 * Render tests for the item pages: X09's one item page (`ItemPageView`, for
 * the item URL and, with a bottle selected, the bottle URL), and the
 * restored `{T}Form.tsx` and `item/` leaves, asserting the **old** markup
 * where it survives.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";
import {
  NextImageConfig,
  nextImageModule,
  optimizedSrc,
} from "../../test-support/next-image";

mock.module("next/image", () => nextImageModule("art"));
mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/teas/t1",
  useSearchParams: () => new URLSearchParams(),
}));

const { ItemPageView } = await import("./ItemPageView");
const { ItemForm } = await import("./ItemForm");
const { ItemImage } = await import("./ItemImage");
const { itemOverflow } = await import("./header-actions");
const { openTag } = await import("../../test-support/markup");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  renderToStaticMarkup(<Provider value={client}>{node}</Provider>).replace(
    /<style[^>]*>[^<]*<\/style>/g,
    "",
  );

type ItemView = Parameters<typeof ItemPageView>[0]["item"];

const tea: ItemView = {
  itemId: "t1",
  type: "TEA",
  name: "Dragonwell",
  description: "A green tea.",
  createdById: "me",
  isFavorite: false,
  isWantToTry: false,
  subTitlePhrases: ["Green", "Loose Leaf", "China", undefined],
  facts: [
    { label: "Category", value: "Green" },
    { label: "Organic", value: "Yes" },
    { label: "Country", value: "China" },
  ],
  flavorProfile: "Chestnut",
  ingredients: null,
  image: null,
  brands: [
    {
      id: "ib",
      is_primary: true,
      brand: {
        id: "b",
        name: "West Lake",
        logo_url: null,
        brand_type: "tea_house",
      },
    },
  ],
  reviews: [],
  reviewsEndCursor: null,
  reviewsHasNextPage: false,
  myReview: null,
  everyone: { average: null, count: 0 },
  friends: { average: null, count: 0 },
  plate: { producer: "West Lake", name: "Dragonwell", origin: "China" },
  plateStyle: null,
};

type PageProps = Parameters<typeof ItemPageView>[0];

const page = (over: Partial<PageProps> = {}) =>
  render(
    <ItemPageView
      item={tea}
      bottles={[]}
      parent="/"
      cellars={[]}
      tierLists={[]}
      recipes={[]}
      addableCellars={[]}
      editHref={null}
      {...over}
    />,
  );

const bottle = (over: Partial<PageProps["bottles"][number]> = {}) => ({
  id: "b1",
  cellarId: "c",
  cellarName: "Home",
  openAt: null,
  emptyAt: null,
  percentageRemaining: 100,
  ...over,
});

describe("ItemPageView (X09: one item page)", () => {
  const html = page({
    tierLists: [
      { id: "e", band: 5, tier_list: { id: "l", name: "Best teas" } },
    ],
    recipes: [
      {
        id: "ri",
        quantity: 0.5,
        unit: "cup",
        is_optional: true,
        recipe: {
          id: "r",
          name: "Tea Punch",
          type: "cocktail",
          image_url: null,
          difficulty_level: 1,
        },
      },
      {
        id: "rf",
        quantity: 2,
        unit: "tbsp",
        is_optional: false,
        recipe: {
          id: "f",
          name: "Tea-Smoked Duck",
          type: "food",
          image_url: null,
          difficulty_level: 3,
        },
      },
    ],
    addableCellars: [{ id: "c", name: "Home" }],
    editHref: "/teas/t1/edit",
  });

  test("hero: one h1, the producer links to its brand, the subtitle", () => {
    // The page's one h1: the AppBar has no title on the item page, and the
    // sections under it are h2s.
    assert.match(html, /<h1[^>]*>Dragonwell/);
    assert.equal(html.match(/<h1\b/g)?.length, 1);
    assert.match(html, /href="\/brands\/b"[^>]*>West Lake</);
    assert.match(html, /Green · Loose Leaf · China/);
    assert.match(html, /aria-label="Love Dragonwell"/);
  });

  test("taste header: You · Friends · Everyone, words where there is no number", () => {
    const header = html.slice(html.indexOf('data-testid="taste-header"'));
    assert.match(header, /aria-label="You: Rate it"/);
    assert.match(header, /aria-label="Friends: No friends&#x27; ratings"/);
    assert.match(header, /aria-label="Everyone: No ratings yet"/);
    assert.match(header, /href="#your-review"/);
    // Grounded numbers only: never a percentage.
    assert.doesNotMatch(header.slice(0, header.indexOf("</nav>")), /%/);
  });

  test("taste header: your score, friends' and everyone's averages with counts", () => {
    const rated = page({
      item: {
        ...tea,
        myReview: { id: "r", score: 4.5, text: null },
        friends: { average: 4.25, count: 2 },
        everyone: { average: 3.9, count: 12 },
      },
    });
    assert.match(rated, /aria-label="You: rated 4.5 out of 5, Your rating"/);
    assert.match(rated, /aria-label="Friends: rated 4.25 out of 5, 2 friends"/);
    assert.match(rated, />4.3<!-- -->|>4.3</);
    assert.match(
      rated,
      /aria-label="Everyone: rated 3.9 out of 5, 12 ratings"/,
    );
  });

  test("fact sheet: every recorded attribute as a row, then the notes", () => {
    const facts = html.slice(html.indexOf('data-testid="item-facts"'));
    assert.match(facts, /<dt[^>]*>Organic<\/dt><dd[^>]*>Yes<\/dd>/);
    assert.match(facts, /<dt[^>]*>Country<\/dt><dd[^>]*>China<\/dd>/);
    assert.match(facts, />Flavor Profile</);
    assert.match(facts, />Chestnut</);
    assert.match(facts, /A green tea\./);
  });

  test("sections: producer under one title, food recipes only, reviews, lists", () => {
    assert.match(html, />Tea house</);
    assert.doesNotMatch(html, /Tea Brands/);
    // "Cocktails with this" (X14) carries the cocktail; this list cooks.
    assert.match(html, />Cook with this \(1\)</);
    assert.match(html, />Tea-Smoked Duck</);
    assert.doesNotMatch(html, />Tea Punch</);
    assert.match(html, /2 tbsp of Dragonwell/);
    assert.match(html, />Located in</);
    assert.match(html, /Not in any cellar you can see\./);
    assert.match(html, />On tier lists</);
    assert.match(html, />Best teas</);
    assert.match(html, />Outstanding</);
    assert.match(html, /id="reviews"/);
    assert.match(html, /No reviews yet! Want to add one\?/);
    assert.match(html, /id="your-review"/);
    assert.match(html, /placeholder="Add a Review\.\.\."/);
    assert.match(html, /id="your-log"/);
    // The creator's one-tap brand change (D8).
    assert.match(html, />Wrong brand\? Change it</);
  });

  test("ActionBar: Log a drink · Add to cellar · Want to try · ⋯", () => {
    const bar = openTag(html, 'data-testid="item-action-bar"');
    assert.match(bar, /role="toolbar"/);
    const after = html.slice(html.indexOf('data-testid="item-action-bar"'));
    assert.match(after, />Log a drink</);
    assert.match(after, />Add to cellar</);
    assert.match(after, /aria-label="Want to try Dragonwell"/);
    assert.match(after, /aria-label="More actions"/);
    // Share stays the AppBar's trailing action too.
    assert.match(html, /<button[^>]*aria-label="Share"/);
    // No Your bottles section when you have none.
    assert.doesNotMatch(html, />Your bottles</);
  });

  test("`⋯`: tier list and Share for everyone, Edit for the creator, Delete bottle last", () => {
    assert.deepEqual(
      itemOverflow({ editHref: null }).map((entry) => entry.label),
      ["Add to tier list", "Share"],
    );
    assert.deepEqual(itemOverflow({ editHref: "/x/edit", canDelete: true }), [
      { action: "tierList", label: "Add to tier list" },
      { action: "share", label: "Share" },
      { action: "edit", label: "Edit item" },
      { action: "delete", label: "Delete bottle", destructive: true },
    ]);
  });

  test("no Add to cellar for a viewer with no cellar to add to", () => {
    assert.doesNotMatch(page(), />Add to cellar</);
  });

  test("no image: the item's LabelPlate stands in, named by its text (N28)", () => {
    const plate = openTag(html, 'data-slot="label-plate"');
    assert.match(plate, /data-type="TEA"/);
    assert.match(plate, /role="img"/);
    assert.match(plate, /aria-label="Label: West Lake Dragonwell, China"/);
    assert.doesNotMatch(html, /data-alt="A picture of a glass"/);
  });

  test("the hero plate draws the item's style vessel (H-6)", () => {
    const bagged = page({
      item: { ...tea, plateStyle: { form: "TEA_BAG" } },
    });
    assert.match(bagged, /data-vessel="pouch"/);
  });
});

describe("Your bottles (X09)", () => {
  test("each bottle: its cellar, its state, Pour and Log", () => {
    const html = page({
      bottles: [
        bottle({
          id: "b1",
          openAt: "2026-01-01T00:00:00Z",
          percentageRemaining: 40,
        }),
        bottle({ id: "b2", cellarName: "Garage" }),
      ],
      bottlesTotal: 2,
    });
    assert.match(html, />Your bottles</);
    assert.match(html, />2 bottles</);
    assert.match(html, />Open · 40% left</);
    assert.match(html, />Sealed</);
    assert.match(html, /href="\/cellars\/c\/teas\/b1"/);
    assert.match(html, /aria-label="Pour from Home"/);
    assert.match(html, /aria-label="Log a drink from Garage"/);
    // Nothing is selected on the item's own URL (the breadcrumbs' own
    // aria-current is the page's, not a bottle's).
    assert.doesNotMatch(html, /aria-current="page"[^>]*>Home</);
    assert.doesNotMatch(html, /data-selected/);
    assert.doesNotMatch(html, /data-testid="selected-bottle"/);
  });
});

describe("the bottle route: the item page with that bottle selected (X09)", () => {
  const selected = (over: Record<string, unknown> = {}) => ({
    ...bottle(),
    isOwner: true,
    displayImage: null,
    ...over,
  });

  test("yours, sealed: marked, Pour (whose first pour opens it), Mark as opened inline, the photo tile, the hero line", () => {
    const html = page({
      selected: selected(),
      bottles: [bottle()],
      parent: "/cellars/c/items",
    });
    assert.match(html, /aria-current="page"[^>]*>Home</);
    // X03: a sealed bottle is poured (the first pour opens it); opening
    // without pouring is the quiet "Mark as opened".
    assert.match(html, /aria-label="Pour from Home"/);
    assert.match(html, />Mark as opened</);
    assert.doesNotMatch(html, />Open it!</);
    assert.match(html, /<button[^>]*aria-label="Add a photo"/);
    assert.match(html, /This bottle · Home · Sealed/);
  });

  test("the selected bottle leads Your bottles, the rest keep their order", () => {
    const html = page({
      selected: selected({ id: "b2", cellarName: "Garage" }),
      bottles: [
        bottle({ id: "b1", openAt: "2026-01-01T00:00:00Z" }),
        bottle({ id: "b2", cellarName: "Garage" }),
        bottle({ id: "b3", cellarName: "Attic" }),
      ],
    });
    const order = [...html.matchAll(/href="\/cellars\/c\/teas\/(b\d)"/g)].map(
      (match) => match[1],
    );
    assert.deepEqual(order, ["b2", "b1", "b3"]);
  });

  test("yours, opened: the level inline", () => {
    const html = page({
      selected: selected({
        openAt: "2026-01-01T00:00:00Z",
        percentageRemaining: 40,
      }),
      bottles: [
        bottle({ openAt: "2026-01-01T00:00:00Z", percentageRemaining: 40 }),
      ],
    });
    assert.match(html, /Remaining: 40%/);
    assert.doesNotMatch(html, />Mark as opened</);
  });

  test("yours, finished: still listed, with Restore and no Pour", () => {
    const html = page({
      selected: selected({
        openAt: "2026-01-01T00:00:00Z",
        emptyAt: "2026-01-03T00:00:00Z",
        percentageRemaining: 0,
      }),
      bottles: [],
    });
    assert.match(html, />Finished</);
    assert.match(html, />Restore to cellar</);
    assert.doesNotMatch(html, /aria-label="Pour from Home"/);
  });

  test("someone else's: read-only, no level, no photo tile, no Pour", () => {
    const html = page({
      selected: selected({ isOwner: false, cellarName: "Sam's" }),
    });
    assert.match(html, />This bottle</);
    assert.match(html, />Sam&#x27;s</);
    assert.doesNotMatch(html, />Mark as opened</);
    assert.doesNotMatch(html, /aria-label="Add a photo"/);
    assert.doesNotMatch(html, />Your bottles</);
  });
});

describe("ItemImage (restored)", () => {
  test("a presigned photo goes through /_next/image at the old 500 px", () => {
    const photo = "https://files.test/cellar-files/item-image/i.jpg?sig=1";
    const html = renderToStaticMarkup(
      <NextImageConfig>
        <ItemImage
          url={photo}
          placeholder="png;base64,AAAA"
          fallback={<span data-testid="plate" />}
        />
      </NextImageConfig>,
    );
    assert.ok(html.includes(`${optimizedSrc(photo, 500)} 1x`), html);
    assert.ok(html.includes(`src="${optimizedSrc(photo, 1080)}"`));
    assert.match(
      html,
      /background-image:url\(&quot;data:image\/png;base64,AAAA/,
    );
    assert.doesNotMatch(html, /data-next-image="art"/);
  });
});

describe("ItemForm (restored {T}Form, edit mode)", () => {
  test("wine: old order and labels, vintage as a year", () => {
    const html = render(
      <ItemForm
        id="w1"
        type="WINE"
        defaultValues={{
          name: "Barolo",
          description: "",
          country: "",
          attributes: { vintage: "2019-06-01", style: "RED" },
        }}
        onSavedHref="/wines/w1"
      />,
    );
    const labels = [...html.matchAll(/<label[^>]*>([^<]+)/g)].map(
      (match) => match[1],
    );
    assert.deepEqual(labels, [
      "Name",
      "Vintage",
      "Description",
      "Style",
      "Variety",
      "Country",
      "Region",
      "Alcohol Content",
      "Vineyard Designation",
      "Special Designation",
    ]);
    assert.match(html, /value="2019"/);
    assert.match(html, /type="submit"[^>]*>Save</);
  });

  test("tea: Organic and Fair Trade checkboxes", () => {
    const html = render(
      <ItemForm
        id="t1"
        type="TEA"
        defaultValues={{
          name: "Dragonwell",
          description: "",
          country: "",
          attributes: { isOrganic: "true" },
        }}
        onSavedHref="/teas/t1"
      />,
    );
    assert.match(html, />Organic</);
    assert.match(html, />Fair Trade</);
    assert.match(html, /checked=""/);
  });
});

describe("one producer title per type, on both URLs (X09)", () => {
  // The item and bottle pages used to disagree ("Wine Brands" vs
  // "Wineries"); one word per type now, and the same on a bottle's URL.
  for (const [type, title] of [
    ["WINE", "Winery"],
    ["BEER", "Brewery"],
    ["SPIRIT", "Distillery"],
    ["COFFEE", "Roaster"],
    ["SAKE", "Brewery"],
    ["TEA", "Tea house"],
  ] as const) {
    test(`${type}: "${title}"`, () => {
      const item = { ...tea, type };
      assert.match(page({ item }), new RegExp(`>${title}<`));
      assert.match(
        page({
          item,
          selected: { ...bottle(), isOwner: true, displayImage: null },
          bottles: [bottle()],
        }),
        new RegExp(`>${title}<`),
      );
    });
  }
});

describe("lists the API stops at 100 rows say so (gap #8)", () => {
  const user = { id: "me", displayName: "Me", avatarUrl: "" };

  test("Located in, On tier lists and Your bottles name what was held back", () => {
    const cellars = Array.from({ length: 100 }, (_, index) => ({
      id: `c${index}`,
      name: `Cellar ${index}`,
      createdBy: user,
      co_owners: [],
    }));
    const html = page({
      cellars,
      cellarsTotal: 140,
      tierLists: [
        { id: "e", band: 5, tier_list: { id: "l", name: "Best teas" } },
      ],
      tierListsTotal: 101,
      bottles: [bottle()],
      bottlesTotal: 60,
    });
    assert.match(html, /Showing the first 100 of 140 cellars\./);
    assert.match(html, /Showing the first 1 of 101 lists\./);
    assert.match(html, /Showing the first 1 of 60 bottles\./);
  });

  test("a whole list carries no note", () => {
    assert.doesNotMatch(
      page({ bottles: [bottle()], bottlesTotal: 1 }),
      /Showing the/,
    );
  });
});

describe("ItemForm edit mode keeps the database's required rule (gap #14b)", () => {
  test("sake: Vintage and Category are not starred on edit, only Name", () => {
    const html = render(
      <ItemForm
        id="s1"
        type="SAKE"
        defaultValues={{
          name: "Dassai 45",
          description: "",
          country: "",
          attributes: {},
        }}
        onSavedHref="/sakes/s1"
      />,
    );
    const starred = [
      ...html.matchAll(/<label[^>]*>([^<]*)<span[^>]*asterisk/g),
    ].map((match) => match[1]);
    assert.deepEqual(starred, ["Name"]);
  });

  test("the form opts out of native validation, so N03's own messages show", () => {
    const html = render(
      <ItemForm
        id="s1"
        type="SAKE"
        defaultValues={{
          name: "",
          description: "",
          country: "",
          attributes: {},
        }}
        onSavedHref="/sakes/s1"
      />,
    );
    // The inputs carry `required` (Joy's FormControl); without `noValidate`
    // the browser cancels the submit before react-hook-form ever runs.
    assert.match(html, /<input[^>]*required/);
    assert.match(html, /<form[^>]*novalidate/i);
  });
});
