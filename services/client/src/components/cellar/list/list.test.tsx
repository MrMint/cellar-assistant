/**
 * The cellar list (C1), server-rendered the way the first paint is: the
 * top (name, bottles, Edit, view), the count strip, tiles by the Arrange
 * sheet's choice, the Needs-details count against the seeded drafts, and the
 * kit's no-match wording. Names come from the demo seed.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";
import { stripStyleBlocks, textOf } from "@/test-support/markup";
import { DRAFTS } from "../../../../../actors/scripts/demo-seed-data";

mock.module("next/image", () => ({
  default: (props: { alt: string }) => (
    <span data-next-image="photo" data-alt={props.alt} />
  ),
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    refresh: () => {},
    back: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/cellars/c1/items",
  useSearchParams: () => new URLSearchParams(),
}));

const { CellarList } = await import("./CellarList");
type Props = Parameters<typeof CellarList>[0];
type Bottle = Props["bottles"][number];

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});

const render = (node: ReactNode, searchParams = "") =>
  stripStyleBlocks(
    renderToStaticMarkup(
      <Provider value={client}>
        <NuqsTestingAdapter searchParams={searchParams}>
          {node}
        </NuqsTestingAdapter>
      </Provider>,
    ),
  );

let n = 0;
const bottle = (over: Partial<Bottle>): Bottle => {
  n += 1;
  return {
    key: `b${n}`,
    itemId: `i${n}`,
    type: "BEER",
    name: `Bottle ${n}`,
    maker: null,
    style: null,
    photoUrl: null,
    plate: null,
    rating: null,
    publicScore: null,
    publicCount: null,
    favorite: false,
    open: false,
    percent: 100,
    count: 1,
    match: null,
    note: null,
    noteDate: null,
    addedAt: null,
    href: `/cellars/c1/beers/b${n}`,
    ...over,
  };
};

const bottles = [
  bottle({
    name: "Copper Kettle Amber",
    maker: "Demo Brewing",
    style: "Amber",
    rating: 4,
  }),
  bottle({
    name: "Ridge Pils",
    maker: "Demo Brewing",
    style: "Pilsner",
    open: true,
    percent: 40,
  }),
  bottle({
    name: "Hillside Garnacha",
    type: "WINE",
    maker: "Demo Valley Cellars",
    note: "Bright, then dusty",
    noteDate: "2026-01-02T00:00:00Z",
  }),
];

const props = (over: Partial<Props> = {}): Props => ({
  cellarId: "c1",
  cellarName: "Home",
  bottles,
  bottleCount: 3,
  capped: false,
  search: "",
  status: "in-cellar",
  statusCounts: { "in-cellar": 3, finished: 1, all: 4 },
  needsDetails: 0,
  canEdit: true,
  ...over,
});

describe("the cellar list", () => {
  test("the top: name, bottles, Edit, the view and the count strip", () => {
    const html = render(<CellarList {...props()} />);
    const text = textOf(html);
    assert.match(html, /<h1[^>]*>Home<\/h1>/);
    assert.match(text, /3 bottles/);
    assert.match(html, /href="\/cellars\/c1\/edit"/);
    assert.match(html, /aria-label="View"/);
    assert.match(html, /aria-label="Search this cellar"/);
    // Open lead, then kinds in the owner's order; zero kinds hidden.
    assert.match(text, /1\s*Open/);
    assert.ok(text.indexOf("Beer") < text.indexOf("Wine"));
    assert.doesNotMatch(text, /Spirit/);
  });

  test("tiles A–Z by default, with the open badge and the wide note tile", () => {
    const html = render(<CellarList {...props()} />);
    const names = [...html.matchAll(/data-slot="cellar-list-tile"/g)];
    assert.equal(names.length, 3);
    const text = textOf(html);
    assert.ok(
      text.indexOf("Copper Kettle Amber") < text.indexOf("Hillside Garnacha"),
    );
    assert.ok(text.indexOf("Hillside Garnacha") < text.indexOf("Ridge Pils"));
    assert.match(text, /Open · 40%/);
    assert.match(text, /“Bright, then dusty”/);
    assert.match(text, /Jan 2, 2026/);
  });

  test("by maker: a header per maker, a maker of one joins Others", () => {
    const html = render(<CellarList {...props()} />, "?sort=maker");
    const headers = [
      ...html.matchAll(
        /data-slot="cellar-section-header"[^>]*><span[^>]*>([^<]+)</g,
      ),
    ].map((m) => m[1]);
    assert.deepEqual(headers, ["Demo Brewing", "Others"]);
  });

  test("rows view, and the Open filter from the URL", () => {
    const html = render(<CellarList {...props()} />, "?view=rows&open=1");
    const rows = [...html.matchAll(/data-slot="cellar-list-row"/g)];
    assert.equal(rows.length, 1);
    assert.match(textOf(html), /Ridge Pils/);
  });

  test("a search with nothing: the kit's words and one action", () => {
    const html = render(
      <CellarList {...props({ bottles: [], search: "smoky" })} />,
    );
    const text = textOf(html);
    assert.match(text, /No bottle matches “smoky”/);
    assert.match(text, /Clear search/);
  });

  test("Needs details: the seeded drafts' count per cellar, linked", () => {
    // Me's cellars each carry one seeded draft (demo-seed-data DRAFTS).
    for (const cellar of ["home", "lake"]) {
      const seeded = DRAFTS.filter(
        (d) => d.owner === "me" && d.cellar === cellar,
      ).length;
      assert.equal(seeded, 1, `seeded drafts in ${cellar}`);
      const html = render(<CellarList {...props({ needsDetails: seeded })} />);
      assert.match(html, /href="\/needs-details\?cellar=c1"/);
      assert.match(textOf(html), /Needs details\s*1 needs details/);
    }
    const none = render(<CellarList {...props({ needsDetails: 0 })} />);
    assert.doesNotMatch(none, /cellar-needs-details/);
  });
});
