/**
 * Render tests for `ItemCard`, asserting the old card's layout
 * (`82450ad1:src/components/item/ItemCard/index.tsx`), kept through the move
 * off Joy: the image, then
 * the linked title block, then the footer of favourite · reviews · score
 * separated by two vertical separators — and each footer section present only
 * when its value is. Read through what a person or assistive tech observes
 * (image, link, `aria-pressed`, separators, the numbers, in document order),
 * never a UI library's class names, so the card can change library without
 * this test noticing.
 *
 * Server-rendered with `react-dom/server`, which is what the first paint of a
 * client component is anyway; no DOM library needed. `next/image` is the
 * real one for the presigned photo and a stub for bundled art
 * (`src/test-support/next-image.tsx` says why).
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
} from "../../../test-support/next-image";

mock.module("next/image", () => nextImageModule("fallback"));

const { ItemCard } = await import("./index");
const { openTag } = await import("../../../test-support/markup");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  renderToStaticMarkup(
    <NextImageConfig>
      <Provider value={client}>{node}</Provider>
    </NextImageConfig>,
  );

/**
 * The card's sections, in document order: the image, the title link, the
 * favourite toggle, the footer's separators (an `<hr>` or a
 * `role="separator"`), and every number shown as a whole text node.
 */
const skeleton = (html: string): string[] =>
  [
    ...html.matchAll(
      /(<img\b|data-next-image=)|(<a\b[^>]*\shref=)|(\saria-pressed=)|(<hr\b|\srole="separator")|>(\d+(?:\.\d+)?)</g,
    ),
  ].map(([, image, link, toggle, separator, number]) =>
    image !== undefined
      ? "image"
      : link !== undefined
        ? "link"
        : toggle !== undefined
          ? "favorite"
          : separator !== undefined
            ? "separator"
            : `${number}`,
  );

/**
 * A card with a photo: most tests below are about the title and the footer,
 * and a photo keeps the LabelPlate (which prints the name) out of the way.
 */
const base = {
  id: "bottle-1",
  itemId: "item-1",
  name: "Barolo",
  displayImageUrl: "https://files.test/b.jpg?sig=2",
};

describe("ItemCard", () => {
  test("full card: image, linked title, subtitle + type chip, three-part footer", () => {
    const html = render(
      <ItemCard
        type="WINE"
        href="/cellars/c1/wines/bottle-1"
        item={{
          ...base,
          vintage: "2016",
          subtitle: "Vietti · Nebbiolo",
          displayImageUrl: "https://files.test/x.jpg?sig=1",
          placeholder: "png;base64,AAAA",
          favoriteCount: 4,
          isFavorite: true,
          reviewCount: 7,
          score: 4.256,
          reviewed: true,
        }}
      />,
    );
    // Image, title link, then the footer: the favourite toggle with its
    // count, a separator, the review count, a separator, the score.
    assert.deepEqual(skeleton(html), [
      "image",
      "link",
      "favorite",
      "4",
      "separator",
      "7",
      "separator",
      "4.3",
    ]);
    // The presigned photo goes through the optimizer: 400 px at 1x, the next configured size (828) at 2x, never the
    // original bytes.
    const photo = "https://files.test/x.jpg?sig=1";
    assert.ok(html.includes(`src="${optimizedSrc(photo, 828)}"`), html);
    assert.ok(html.includes(`${optimizedSrc(photo, 400)} 1x`));
    assert.doesNotMatch(html, /src="https:\/\/files\.test/);
    assert.match(
      html,
      /background-image:url\(&quot;data:image\/png;base64,AAAA&quot;\)/,
    );
    // Wine titles lead with the vintage.
    assert.match(html, /href="\/cellars\/c1\/wines\/bottle-1"/);
    assert.match(html, />2016 Barolo</);
    assert.match(html, />Vietti · Nebbiolo</);
    // The type is a chip: its glyph and its word.
    assert.match(openTag(html, 'data-slot="type-chip"'), /data-type="WINE"/);
    assert.match(html, /data-slot="type-chip"[^>]*>.*?Wine<\/span>/);
    // Footer values, each named for assistive tech; the score is the kit's
    // `Stars` with the one-decimal score, and marked as reviewed by the viewer.
    assert.match(html, />4<\/span><span[^>]*> loves</);
    assert.match(html, />7<\/span><span[^>]*> reviews</);
    assert.match(html, /aria-label="Rated 4\.26 out of 5"/);
    assert.match(html, /data-reviewed="true"/);
    // Favourited: pressed, and the heart is filled in the heart token.
    const toggle = openTag(html, 'aria-pressed="true"');
    assert.match(toggle, /^<button\b/);
    assert.match(html, /fill-current text-heart/);
    // Your own verdict: gold stars (CROSS-LOT ruling 1).
    assert.match(html, /data-tone="owner"/);
  });

  test("no image: the item's own LabelPlate, not the type's clip art (N28)", () => {
    const html = render(
      <ItemCard
        type="SAKE"
        href="/sakes/i"
        item={{
          ...base,
          name: "Dassai 23",
          displayImageUrl: undefined,
          plate: {
            producer: "Asahi Shuzo",
            name: "Dassai 23",
            vintage: "2021",
          },
        }}
      />,
    );
    assert.doesNotMatch(html, /data-next-image=|<img\b/);
    const plate = openTag(html, 'data-slot="label-plate"');
    assert.match(plate, /data-type="SAKE"/);
    // Decorative: the title link already names the item.
    assert.match(plate, /aria-hidden="true"/);
    assert.match(html, />Asahi Shuzo</);
    assert.match(html, />2021</);
  });

  test("a wine with no vintage is titled by its name alone", () => {
    const html = render(
      <ItemCard type="WINE" href="/wines/i" item={{ ...base, name: "Brut" }} />,
    );
    assert.match(html, />Brut<\/span><\/a>/);
    assert.doesNotMatch(html, /undefined/);
  });

  test("no image and no plate data: a name-only plate", () => {
    const html = render(
      <ItemCard
        type="TEA"
        href="/teas/i"
        item={{ ...base, name: "Sencha", displayImageUrl: undefined }}
      />,
    );
    assert.match(openTag(html, 'data-slot="label-plate"'), /data-type="TEA"/);
    assert.match(html, /data-slot="label-plate-name"[^>]*>Sencha</);
  });

  test("non-wine titles do not lead with a vintage", () => {
    const html = render(
      <ItemCard
        type="BEER"
        href="/beers/i"
        item={{ ...base, name: "Pliny", vintage: "2020" }}
      />,
    );
    assert.match(html, />Pliny</);
    assert.doesNotMatch(html, /2020 Pliny/);
  });

  test("missing counts hide their footer sections and the dividers beside them", () => {
    const html = render(<ItemCard type="WINE" href="/wines/i" item={base} />);
    // Joy's trailing divider vanished against the card's border; this tile
    // has none, so a divider is drawn only between two shown sections.
    assert.deepEqual(skeleton(html), ["image", "link"]);
    // An empty subtitle keeps its line with a non-breaking space.
    assert.match(html, />\u00a0<\/span>/);
  });

  test("a zero review count still shows, as the old aggregate did", () => {
    const html = render(
      <ItemCard type="TEA" href="/teas/i" item={{ ...base, reviewCount: 0 }} />,
    );
    assert.match(html, />0<\/span>/);
    assert.deepEqual(skeleton(html), ["image", "link", "0"]);
  });

  test("a divider joins the shown sections across a missing one", () => {
    const html = render(
      <ItemCard
        type="WINE"
        href="/wines/i"
        item={{ ...base, favoriteCount: 2, score: 4 }}
      />,
    );
    assert.deepEqual(skeleton(html), [
      "image",
      "link",
      "favorite",
      "2",
      "separator",
      "4.0",
    ]);
  });

  test("an unreviewed score is not marked as reviewed", () => {
    const html = render(
      <ItemCard
        type="COFFEE"
        href="/coffees/i"
        item={{ ...base, score: 3, reviewed: false }}
      />,
    );
    // The stars and the score still show, in the others' tone; only the
    // reviewed mark goes.
    assert.match(html, />3\.0</);
    assert.match(html, /data-tone="other"/);
    assert.match(html, /aria-label="Rated 3 out of 5"/);
    assert.doesNotMatch(html, /data-reviewed/);
  });

  test("onClick without href: title rendered bare, no link", () => {
    const html = render(
      <ItemCard type="SPIRIT" onClick={() => {}} item={base} />,
    );
    assert.deepEqual(skeleton(html), ["image"]);
    assert.doesNotMatch(html, /<a\b/);
    assert.match(html, />Barolo</);
    // The whole tile is a button named for the item.
    assert.match(openTag(html, 'aria-label="Barolo"'), /^<button\b/);
  });

  test("every target in the clipped card rings inside it, and the heart is never disabled", () => {
    // The card is overflow-hidden, so an outset focus ring on the stretched
    // link or button (exactly the card's box) would be clipped to nothing.
    const linked = render(
      <ItemCard
        type="WINE"
        href="/wines/i"
        item={{ ...base, favoriteCount: 1 }}
      />,
    );
    assert.match(
      openTag(linked, 'href="/wines/i"'),
      /focus-visible:after:ring-inset/,
    );
    const heart = openTag(linked, "aria-pressed=");
    assert.match(heart, /focus-visible:ring-inset/);
    // Never disabled (X24: a second tap is a second toggle), and above the
    // stretched link that sits underneath it.
    assert.doesNotMatch(heart, /\sdisabled[=\s>]/);
    assert.match(heart, /\bz-10\b/);
    const bare = render(
      <ItemCard type="SPIRIT" onClick={() => {}} item={base} />,
    );
    assert.match(
      openTag(bare, 'aria-label="Barolo"'),
      /focus-visible:ring-inset/,
    );
  });

  test("neither href nor onClick: image and footer only", () => {
    const html = render(<ItemCard type="WINE" item={base} />);
    assert.deepEqual(skeleton(html), ["image"]);
    assert.doesNotMatch(html, />Barolo</);
    assert.doesNotMatch(html, /<button\b/);
  });

  test("not favourited: outline heart", () => {
    const html = render(
      <ItemCard
        type="WINE"
        href="/wines/i"
        item={{ ...base, favoriteCount: 0, isFavorite: false }}
      />,
    );
    assert.match(html, /aria-pressed="false"/);
    assert.doesNotMatch(html, /text-heart/);
  });

  test("B05: the linked title is the morph source, named for its href", () => {
    const html = render(<ItemCard type="WINE" href="/wines/i" item={base} />);
    assert.match(
      html,
      /<a [^>]*href="\/wines\/i"><span data-slot="morph-title"/,
    );
  });

  test("H-2: with no photo the plate draws the item's style vessel", () => {
    const html = render(
      <ItemCard
        type="WINE"
        href="/wines/i"
        item={{
          ...base,
          displayImageUrl: undefined,
          styleFields: { variety: "PINOT_NOIR" },
        }}
      />,
    );
    assert.match(html, /data-vessel="burgundy"/);
  });
});
