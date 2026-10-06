/**
 * Render tests for the restored `ItemCard`, asserting the **old** card's
 * markup (`82450ad1:src/components/item/ItemCard/index.tsx`): image overflow,
 * then the title block, then the soft footer of favourite · reviews · score
 * separated by two vertical dividers — and each footer section present only
 * when its value is.
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

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
/** Markup with Emotion's inline `<style>` tags removed — structure only. */
const render = (node: ReactNode) =>
  renderToStaticMarkup(
    <NextImageConfig>
      <Provider value={client}>{node}</Provider>
    </NextImageConfig>,
  ).replace(/<style[^>]*>[^<]*<\/style>/g, "");

/** The card's section skeleton, in document order. */
const skeleton = (html: string): string[] =>
  [
    ...html.matchAll(
      /Mui(Card|CardOverflow|CardContent|Divider|Button|Link)-root/g,
    ),
  ].map((m) => m[1]);

const base = { id: "bottle-1", itemId: "item-1", name: "Barolo" };

describe("ItemCard (restored)", () => {
  test("full card: image, linked title, subtitle + type icon, three-part footer", () => {
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
    assert.deepEqual(skeleton(html), [
      "Card",
      "CardOverflow",
      "CardContent",
      "Link",
      "CardOverflow",
      "Button",
      "Divider",
      "Divider",
    ]);
    // The presigned photo goes through the optimizer, as the old card's Nhost
    // URL did: 400 px at 1x, the next configured size (828) at 2x, never the
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
    // Footer values; score to two places; gold star because reviewed.
    assert.match(html, />4<\/p>/);
    assert.match(html, />7<span/);
    assert.match(html, />4\.26<span/);
    assert.match(html, /color:#ffba26/);
    assert.match(html, /aria-pressed="true"/);
    assert.match(html, /color:red/);
  });

  test("no image: falls back to the bundled art for the type", () => {
    const html = render(<ItemCard type="SAKE" href="/sakes/i" item={base} />);
    assert.match(html, /data-next-image="fallback"/);
    assert.match(html, /data-alt="A sake bottle"/);
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

  test("missing counts hide their footer sections; the dividers stay", () => {
    const html = render(<ItemCard type="WINE" href="/wines/i" item={base} />);
    assert.deepEqual(skeleton(html), [
      "Card",
      "CardOverflow",
      "CardContent",
      "Link",
      "CardOverflow",
      "Divider",
      "Divider",
    ]);
    // An empty subtitle keeps its line with a non-breaking space.
    assert.match(html, /text-overflow:ellipsis"> </);
  });

  test("a zero review count still shows, as the old aggregate did", () => {
    const html = render(
      <ItemCard type="TEA" href="/teas/i" item={{ ...base, reviewCount: 0 }} />,
    );
    assert.match(html, />0<span/);
  });

  test("unreviewed score uses the icon colour, not gold", () => {
    const html = render(
      <ItemCard
        type="COFFEE"
        href="/coffees/i"
        item={{ ...base, score: 3, reviewed: false }}
      />,
    );
    assert.match(html, />3\.00<span/);
    assert.match(html, /color:var\(--Icon-color\)/);
    assert.doesNotMatch(html, /#ffba26/);
  });

  test("onClick without href: title rendered bare, no link", () => {
    const html = render(
      <ItemCard type="SPIRIT" onClick={() => {}} item={base} />,
    );
    assert.equal(skeleton(html).includes("Link"), false);
    assert.equal(skeleton(html).includes("CardContent"), false);
    assert.match(html, />Barolo</);
  });

  test("neither href nor onClick: image and footer only", () => {
    const html = render(<ItemCard type="WINE" item={base} />);
    assert.doesNotMatch(html, />Barolo</);
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
    assert.doesNotMatch(html, /color:red/);
  });
});
