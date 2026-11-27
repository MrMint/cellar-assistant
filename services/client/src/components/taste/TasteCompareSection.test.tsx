/**
 * FriendProfile's Compare section as first paint meets it: the `#compare`
 * anchor there before the agreement query lands (CR-15), every list a friend
 * shares offered for copying — including those past the first page (CR-16) —
 * and a Copy button that is a 44px target (CR-9, L8).
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
  usePathname: () => "/taste-profile",
  useSearchParams: () => new URLSearchParams(),
}));
mock.module("next/image", () => ({
  default: (props: { alt: string }) => (
    <span data-next-image="photo" data-alt={props.alt} />
  ),
}));

const { TasteCompareSection } = await import("./TasteCompareSection");
const { openTag, textOf } = await import("@/test-support/markup");

/** A client whose every query never answers: the loading paint. */
const pending = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});

const render = (client: Client, node: ReactNode) =>
  renderToStaticMarkup(<Provider value={client}>{node}</Provider>);

const list = (n: number) => ({
  id: `l${n}`,
  name: `List ${n}`,
  href: `/tier-lists/l${n}`,
  description: "",
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
