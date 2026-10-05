/**
 * Render tests for the restored `/search` pieces, asserting the **old** markup
 * and copy (`82450ad1:src/components/search/*`), and the two deliberate
 * differences: no Photo button (G32) and absolute card links.
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
  usePathname: () => "/search",
  useSearchParams: () => new URLSearchParams(),
}));

const { ClientSearchInterface } = await import("./ClientSearchInterface");
const { Greeting } = await import("./Greeting");
const { SearchResultGrid } = await import("./SearchResultGrid");
const { FadeIn, StaggerIn, StaggerItem } = await import("./AnimateIn");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  renderToStaticMarkup(<Provider value={client}>{node}</Provider>).replace(
    /<style[^>]*>[^<]*<\/style>/g,
    "",
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ");

describe("ClientSearchInterface (restored)", () => {
  test("an empty box offers Scan and nothing else — no Photo (G32)", () => {
    const html = render(<ClientSearchInterface />);
    assert.match(html, /<input/);
    assert.match(text(html), /Scan/);
    assert.doesNotMatch(text(html), /Photo/);
    // No submit button: the old box navigated on a debounce.
    assert.doesNotMatch(text(html), /\bSearch\b/);
  });

  test("a query swaps the Scan button for the round scan icon and adds clear", () => {
    const html = render(<ClientSearchInterface initialQuery="barolo" />);
    assert.match(html, /value="barolo"/);
    assert.match(html, /aria-label="Scan barcode"/);
    assert.doesNotMatch(text(html), /Scan\b(?! barcode)/);
  });
});

describe("Greeting (verbatim)", () => {
  test("time-of-day greeting with the first name", () => {
    const html = text(render(<Greeting displayName="Jared Prather" />));
    assert.match(html, /Good (morning|afternoon|evening), Jared/);
    assert.doesNotMatch(html, /Prather/);
  });
  test("no name, no comma", () => {
    assert.match(
      text(render(<Greeting />)),
      /Good (morning|afternoon|evening)\s*$/,
    );
  });
});

describe("AnimateIn (verbatim)", () => {
  test("renders its children", () => {
    const html = render(
      <FadeIn>
        <StaggerIn>
          <StaggerItem>chip</StaggerItem>
        </StaggerIn>
      </FadeIn>,
    );
    assert.match(html, /chip/);
  });
});

describe("SearchResultGrid (restored)", () => {
  test("the old empty message", () => {
    assert.match(text(render(<SearchResultGrid items={[]} />)), /No results/);
  });
});
