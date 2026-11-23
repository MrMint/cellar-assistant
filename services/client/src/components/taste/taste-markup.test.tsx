/**
 * /taste-profile and FriendProfile's Compare section as first paint meets
 * them: one h1 on the page (CR-13), the `#compare` anchor there before the
 * agreement query lands (CR-15), every list a friend shares offered for
 * copying — including those past the first page (CR-16) — and a Copy button
 * that is a 44px target (CR-9, L8).
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, createRequest, Provider, ssrExchange } from "urql";

mock.module("next/navigation", () => ({
  useRouter: () => ({
    replace: () => {},
    push: () => {},
    refresh: () => {},
    back: () => {},
  }),
  usePathname: () => "/taste-profile",
  useSearchParams: () => new URLSearchParams(),
}));
mock.module("next/image", () => ({
  default: (props: { alt: string }) => (
    <span data-next-image="photo" data-alt={props.alt} />
  ),
}));

const { TasteProfileView } = await import("./TasteProfileView");
const { TasteCompareSection } = await import("./TasteCompareSection");
const { TasteProfileQuery } = await import("./queries");
const { openTag, textOf } = await import("@/test-support/markup");

/** A client whose every query never answers: the loading paint. */
const pending = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});

/** A client that answers the taste-profile query at once with `data`. */
const answering = (data: unknown) =>
  new Client({
    url: "http://test.invalid/graphql",
    exchanges: [
      ssrExchange({
        isClient: true,
        initialState: {
          [createRequest(TasteProfileQuery, {}).key]: {
            data: JSON.stringify(data),
          },
        },
      }),
    ],
  });

const render = (client: Client, node: ReactNode) =>
  renderToStaticMarkup(<Provider value={client}>{node}</Provider>);

const list = (n: number) => ({
  id: `l${n}`,
  name: `List ${n}`,
  href: `/tier-lists/l${n}`,
  description: "",
});

const PROFILE = {
  tasteProfile: {
    __typename: "TasteProfile",
    ratingCount: 12,
    line: "You lean toward bright, dry whites.",
    linePhrasedByAi: false,
    types: {
      edges: [{ node: { itemType: "WINE", count: 12 } }],
    },
    archetype: {
      key: "bright-whites",
      title: "The Bright White",
      loves: { edges: [] },
    },
    friends: { __typename: "TasteAgreementConnection", edges: [] },
  },
};

describe("TasteProfileView", () => {
  test("the AppBar's title is the one h1; the archetype is an h2", () => {
    const html = render(answering(PROFILE), <TasteProfileView />);
    assert.ok(textOf(html).includes("The Bright White"));
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.match(html, /<h2\b[^>]*>The Bright White<\/h2>/);
  });
});

describe("TasteCompareSection", () => {
  const firstPage = {
    rows: Array.from({ length: 20 }, (_, i) => list(i + 1)),
    endCursor: "c20",
    hasNextPage: true,
    totalCount: 25,
  };

  test("the #compare anchor is there before the agreement answers", () => {
    const html = render(
      pending,
      <TasteCompareSection userId="f1" lists={firstPage} />,
    );
    assert.notEqual(openTag(html, 'id="compare"'), "");
    assert.match(html, /data-slot="taste-compare-pending"/);
  });

  test("a friend's lists past the first page can be reached to copy", () => {
    const html = render(
      pending,
      <TasteCompareSection userId="f1" lists={firstPage} />,
    );
    assert.equal(
      (html.match(/aria-label="Copy List \d+ to your lists"/g) ?? []).length,
      20,
    );
    assert.ok(textOf(html).includes("Show more lists"));
  });

  test("Copy is a 44px target", () => {
    const html = render(
      pending,
      <TasteCompareSection userId="f1" lists={firstPage} />,
    );
    const copy = openTag(html, 'aria-label="Copy List 1 to your lists"');
    assert.match(copy, /\bmin-h-11\b/);
    assert.match(copy, /\bmin-w-11\b/);
  });
});
