/**
 * H-7: the tier-list page's heading is the target of TierListCard's title
 * morph (B05), named for the current pathname.
 *
 * `<ViewTransition>` renders nothing on the server, so `MorphTitle` is
 * swapped for a probe that marks its child. The probe passes through to the
 * real component unless `probing` is on, so the module mock (process-wide in
 * bun) changes no other file's markup.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";
import { TooltipProvider } from "@/components/ui/tooltip";

mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/tier-lists/tl-1",
  useSearchParams: () => new URLSearchParams(),
}));
mock.module("nuqs", () => ({
  parseAsStringLiteral: () => ({ withDefault: (value: string) => value }),
  useQueryState: (key: string) => [key === "tab" ? "rankings" : null, () => {}],
}));

const real = await import("@/components/app/RouteTransition");
// Held before the mock: bun patches `real` in place, so `real.MorphTitle`
// would be the probe itself afterwards.
const RealMorphTitle = real.MorphTitle;
let probing = false;
mock.module("@/components/app/RouteTransition", () => ({
  ...real,
  MorphTitle: (props: ComponentProps<typeof RealMorphTitle>) =>
    probing ? (
      <span data-morph={props.href ?? "(self)"}>{props.children}</span>
    ) : (
      RealMorphTitle(props)
    ),
}));

const { TierListViewPage } = await import("./TierListViewPage");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const probe = (node: ReactNode): string => {
  probing = true;
  try {
    return renderToStaticMarkup(
      <Provider value={client}>
        <TooltipProvider>{node}</TooltipProvider>
      </Provider>,
    );
  } finally {
    probing = false;
  }
};

describe("TierListViewPage title morph (H-7)", () => {
  test("the h1 sits in a MorphTitle named for the page itself", () => {
    const html = probe(
      <TierListViewPage
        data={{
          id: "tl-1",
          name: "Best Bars",
          description: "Where to go",
          privacy: "FRIENDS",
          listType: "place",
          isOwner: true,
          itemCount: 0,
          items: [],
          history: null,
        }}
        insightsData={{
          items: [],
          aiInsights: null,
          contentUpdatedAt: null,
          showPlaceStats: true,
        }}
      />,
    );
    assert.match(
      html,
      /<span data-morph="\(self\)"><h1\b[^>]*>Best Bars<\/h1><\/span>/,
    );
    // W-10: a pushed page has Back, as every other one does.
    assert.match(html, /aria-label="Back"/);
    assert.equal(html.match(/<h1\b/g)?.length, 1, "one h1: the list's name");
  });
});
