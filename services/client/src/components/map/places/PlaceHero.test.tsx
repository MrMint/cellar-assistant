/**
 * B03's place heroes: the category → tone table pinned row by row, the
 * neutral fallback, and the frame drawing a photo instead whenever one exists.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { openTag, textOf } from "../../../test-support/markup";
import {
  PLACE_TONE_RULES,
  PLACE_TONES,
  PlaceHero,
  placeTone,
} from "./PlaceHero";

describe("category → tone table", () => {
  for (const [word, tone] of PLACE_TONE_RULES) {
    test(`${word} → ${tone}`, () => {
      assert.equal(placeTone(word), tone);
    });
  }

  test("real slugs", () => {
    assert.equal(placeTone("wine_bar"), "wine");
    assert.equal(placeTone("coffee_shop"), "coffee");
    assert.equal(placeTone("bubble_tea"), "tea");
    assert.equal(placeTone("cocktail_bar"), "spirit");
    assert.equal(placeTone("italian_restaurant"), "food");
    assert.equal(placeTone("beer_wine_and_spirits"), "wine");
    assert.equal(placeTone("Brewery"), "beer");
  });

  test("whole segments only: barbecue is not a bar", () => {
    assert.equal(placeTone("barbecue_restaurant"), "food");
    assert.equal(placeTone("steakhouse"), "neutral");
  });

  test("fallback: unknown or missing category is neutral", () => {
    assert.equal(placeTone("museum"), "neutral");
    assert.equal(placeTone(""), "neutral");
    assert.equal(placeTone(null), "neutral");
    assert.equal(placeTone(undefined), "neutral");
  });

  test("every tone but neutral has a rule", () => {
    const ruled = new Set(PLACE_TONE_RULES.map(([, tone]) => tone));
    for (const tone of PLACE_TONES) {
      if (tone !== "neutral") assert.ok(ruled.has(tone), tone);
    }
  });
});

describe("PlaceHero", () => {
  test("tonal: name as the h1, the category under it, no image", () => {
    const html = renderToStaticMarkup(
      <PlaceHero
        name="Bar Alto"
        category="wine_bar"
        categoryLabel="Wine bar"
      />,
    );
    const root = openTag(html, 'data-slot="place-hero"');
    assert.match(root, /data-tone="wine"/);
    assert.match(root, /data-photo="false"/);
    assert.match(html, /<h1[^>]*>Bar Alto<\/h1>/);
    assert.equal(textOf(html), "Bar Alto Wine bar");
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /data-slot="place-hero-glyph"/);
  });

  test("a real photo wins, in the same frame", () => {
    const html = renderToStaticMarkup(
      <PlaceHero
        name="Bar Alto"
        category="wine_bar"
        photoUrl="https://example.com/p.jpg"
      />,
    );
    assert.match(openTag(html, 'data-slot="place-hero"'), /data-photo="true"/);
    assert.match(html, /<img/);
    assert.doesNotMatch(html, /place-hero-glyph/);
  });
});
