/**
 * X08's surfaces as a person (or VoiceOver) meets them on first paint: the
 * bookmark's name and pressed state, the place sheet's labelled button, the
 * Want to try page's filter, rows and empty state, and insights' one-tap
 * catalog lookup — server-rendered, read through roles and text.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";

mock.module("next/navigation", () => ({
  useRouter: () => ({
    replace: () => {},
    push: () => {},
    refresh: () => {},
    back: () => {},
  }),
  usePathname: () => "/want-to-try",
  useSearchParams: () => new URLSearchParams(),
}));
mock.module("next/image", () => ({
  default: (props: { alt: string }) => (
    <span data-next-image="photo" data-alt={props.alt} />
  ),
}));

const { WantToTryButton } = await import("./WantToTryButton");
const { WantToTryList } = await import("./WantToTryList");
const { TryThisNext } = await import("./TryThisNext");
const { openTag, textOf } = await import("@/test-support/markup");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  renderToStaticMarkup(<Provider value={client}>{node}</Provider>);

const WINE = { kind: "ITEM", itemType: "WINE", itemId: "w1" } as const;

describe("WantToTryButton", () => {
  test("the icon is named for what it saves, and says whether it is on", () => {
    const off = render(
      <WantToTryButton target={WINE} saved={false} name="Barolo" />,
    );
    const tag = openTag(off, 'aria-label="Want to try Barolo"');
    assert.match(tag, /aria-pressed="false"/);
    const on = render(<WantToTryButton target={WINE} saved name="Barolo" />);
    assert.match(
      openTag(on, 'aria-label="Want to try Barolo"'),
      /aria-pressed="true"/,
    );
    // On is a filled bookmark in ink — not brass, not Love's claret.
    assert.match(on, /fill-current text-ink-1/);
    assert.doesNotMatch(on, /fill-brand/);
  });

  test("a pending tap stays on the button, never the row's stretched link", () => {
    // Disabled while pending; the vendored button drops pointer events when
    // disabled, so without this a second tap reaches the link underneath.
    const tag = openTag(
      render(<WantToTryButton target={WINE} saved={false} name="Barolo" />),
      'aria-label="Want to try Barolo"',
    );
    assert.match(tag, /disabled:pointer-events-auto/);
    assert.match(tag, /\bz-10\b/);
  });

  test("the labelled variant reads 'Want to try' in both states", () => {
    const html = render(
      <WantToTryButton
        variant="button"
        target={{ kind: "PLACE", placeId: "p1" }}
        saved
      />,
    );
    assert.match(textOf(html), /Want to try/);
    assert.match(html, /aria-pressed="true"/);
  });
});

const rows = [
  {
    key: "wine:w1",
    target: WINE,
    title: "2016 Barolo",
    description: "Wine · Italy",
    href: "/wines/w1",
    imageUrl: null,
    itemType: "WINE" as const,
    savedAt: "2026-10-08T03:00:00.000Z",
  },
  {
    key: "place:p1",
    target: { kind: "PLACE", placeId: "p1" } as const,
    title: "Cork & Barrel",
    description: "Wine Bar · Madison",
    href: "/places/p1",
    imageUrl: null,
    itemType: null,
    savedAt: "2026-10-08T02:00:00.000Z",
  },
];

describe("WantToTryList", () => {
  test("the filter, a count, and one linked row per thing with its bookmark", () => {
    const html = render(
      <WantToTryList
        initialPage={{
          rows,
          endCursor: null,
          hasNextPage: false,
          totalCount: 2,
        }}
        initialFilter="all"
      />,
    );
    assert.match(html, /<h1[^>]*>Want to try</);
    assert.match(
      html,
      /role="radiogroup"[^>]*aria-label="Show"|aria-label="Show"[^>]*role="radiogroup"/,
    );
    for (const label of ["All", "Drinks", "Places", "Recipes"]) {
      assert.match(textOf(html), new RegExp(label));
    }
    assert.match(textOf(html), /2 saved/);
    assert.match(html, /href="\/wines\/w1"/);
    assert.match(html, /href="\/places\/p1"/);
    assert.match(
      html,
      /aria-label="Want to try 2016 Barolo"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*aria-label="Want to try 2016 Barolo"/,
    );
    assert.doesNotMatch(textOf(html), /Show more/);
  });

  test("an empty filter says what goes there and offers one way to fill it", () => {
    const html = render(
      <WantToTryList
        initialPage={{
          rows: [],
          endCursor: null,
          hasNextPage: false,
          totalCount: 0,
        }}
        initialFilter="places"
      />,
    );
    assert.match(textOf(html), /No places saved yet\./);
    assert.match(html, /href="\/map"/);
  });

  test("a longer list offers Show more", () => {
    const html = render(
      <WantToTryList
        initialPage={{
          rows,
          endCursor: "c2",
          hasNextPage: true,
          totalCount: 60,
        }}
        initialFilter="all"
      />,
    );
    assert.match(textOf(html), /Show more/);
  });
});

describe("TryThisNext", () => {
  test("asks before it searches: one labelled button, no request yet", () => {
    const html = render(
      <TryThisNext
        recommendation="Try a Nebbiolo from Barbaresco."
        itemType="WINE"
        onList={new Set()}
      />,
    );
    assert.match(textOf(html), /Find bottles like this/);
    assert.doesNotMatch(html, /role="status"/);
  });
});
