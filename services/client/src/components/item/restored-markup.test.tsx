/**
 * Render tests for the restored item pages, asserting the **old** markup
 * (`82450ad1:src/components/{wine,…}/{T}Details.tsx`,
 * `Cellar{T}Details.tsx`, `{T}Form.tsx` and the `item/` leaves).
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";

mock.module("next/image", () => ({
  default: (props: { alt: string }) => (
    <span data-next-image="art" data-alt={props.alt} />
  ),
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/teas/t1",
  useSearchParams: () => new URLSearchParams(),
}));

const { ItemPageView } = await import("./ItemPageView");
const { CellarItemPageView } = await import("./CellarItemPageView");
const { ItemForm } = await import("./ItemForm");

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
  subTitlePhrases: ["Green", "Loose Leaf", "China", undefined],
  characteristics: [
    { label: "Category", value: "Green" },
    { label: "Organic", value: "Yes" },
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
};

describe("ItemPageView (restored {T}Details)", () => {
  const html = render(
    <ItemPageView
      item={tea}
      cellars={[]}
      tierLists={[
        { id: "e", band: 5, tier_list: { id: "l", name: "Best teas" } },
      ]}
      recipes={[
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
      ]}
      addableCellars={[{ id: "c", name: "Home" }]}
      editHref="/teas/t1/edit"
    />,
  );

  test("details card: title, subtitle joined with ' - ', description", () => {
    assert.match(html, /MuiTypography-h3[^>]*>Dragonwell/);
    assert.match(html, /Green - Loose Leaf - China/);
    assert.match(html, /A green tea\./);
  });

  test("the old cards and copy", () => {
    assert.match(html, />Tea Characteristics</);
    assert.match(html, /Organic: Yes/);
    assert.match(html, />Flavor Profile</);
    assert.match(html, />Located in:</);
    assert.match(html, /Not in any cellars, variety is the spice of life!/);
    assert.match(html, />On Lists</);
    assert.match(html, />Best teas</);
    assert.match(html, />Outstanding</);
    assert.match(html, />Reviews:</);
    assert.match(html, /No reviews yet! Want to add one\?/);
    assert.match(html, /placeholder="Add a Review\.\.\."/);
    assert.match(html, /Tea Brands \(1\)/);
    assert.match(html, /Used in Recipes \(1\)/);
    assert.match(html, /1\/2 cup of Dragonwell/);
  });

  test("header: Add to Cellar (one cellar = a button), Share, Edit for the creator", () => {
    assert.match(html, />Add to Cellar</);
    assert.match(html, />Share</);
    assert.match(html, /href="\/teas\/t1\/edit"/);
    assert.match(html, /Edit item/);
  });

  test("the fallback picture when there is no image", () => {
    assert.match(html, /data-alt="A picture of a glass"/);
  });
});

describe("CellarItemPageView (restored Cellar{T}Details, one bottle)", () => {
  const props = {
    item: {
      ...tea,
      type: "WINE" as const,
      characteristics: [],
      flavorProfile: null,
    },
    recipes: [],
    cellar: { id: "c", name: "Home" },
    checkIns: [],
    viewer: { id: "me", displayName: "Me", avatarUrl: "" },
    friends: [],
    editHref: null,
  };

  test("unopened, owner: 'Open it!', Delete enabled, Edit disabled for a non-creator", () => {
    const html = render(
      <CellarItemPageView
        {...props}
        isOwner
        bottle={{
          id: "b1",
          openAt: null,
          emptyAt: null,
          percentageRemaining: 100,
          displayImage: null,
        }}
      />,
    );
    assert.match(html, />Open it!</);
    assert.match(html, />Delete item</);
    assert.match(
      html,
      /Mui-disabled[^>]*><span[^>]*><svg.*?<\/svg><\/span>Edit item/,
    );
    assert.match(html, /Add a photo/);
    assert.match(html, />Wineries \(1\)</);
    assert.doesNotMatch(html, />Check In</);
  });

  test("opened: check-ins and the slider", () => {
    const html = render(
      <CellarItemPageView
        {...props}
        isOwner
        bottle={{
          id: "b1",
          openAt: "2026-01-01T00:00:00Z",
          emptyAt: null,
          percentageRemaining: 40,
          displayImage: null,
        }}
        checkIns={[
          {
            id: "ci",
            createdAt: "2026-01-02T10:00:00Z",
            user: { id: "me", displayName: "Me", avatarUrl: "" },
          },
        ]}
      />,
    );
    assert.match(html, />Check In</);
    assert.match(html, /Remaining: 40%/);
    assert.match(html, /Opened/);
    assert.match(html, /2026-01-02/);
    assert.doesNotMatch(html, />Open it!</);
  });

  test("emptied: 'Empty … ago', no slider", () => {
    const html = render(
      <CellarItemPageView
        {...props}
        isOwner={false}
        bottle={{
          id: "b1",
          openAt: "2026-01-01T00:00:00Z",
          emptyAt: "2026-01-03T00:00:00Z",
          percentageRemaining: 0,
          displayImage: null,
        }}
      />,
    );
    assert.match(html, /Empty/);
    assert.doesNotMatch(html, /Remaining:/);
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
