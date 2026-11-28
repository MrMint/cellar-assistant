/**
 * FriendProfile's agreement card as first paint meets it: the `#compare`
 * anchor there before the agreement query lands (CR-15), and a link into the
 * compare screen. Copying lists moved to the profile's Lists section
 * (profile-markup.test.tsx keeps CR-16 and CR-9).
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
const { openTag } = await import("@/test-support/markup");

/** A client whose every query never answers: the loading paint. */
const pending = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});

const render = (client: Client, node: ReactNode) =>
  renderToStaticMarkup(<Provider value={client}>{node}</Provider>);

describe("TasteCompareSection", () => {
  test("the #compare anchor is there before the agreement answers", () => {
    const html = render(pending, <TasteCompareSection userId="f1" />);
    assert.notEqual(openTag(html, 'id="compare"'), "");
    assert.match(html, /data-slot="taste-compare-pending"/);
  });

  test("the card opens the compare screen for this person", () => {
    const html = render(pending, <TasteCompareSection userId="f1" />);
    assert.match(html, /href="\/users\/f1\/compare"/);
  });
});
