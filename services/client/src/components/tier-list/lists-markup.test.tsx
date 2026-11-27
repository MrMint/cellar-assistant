/**
 * Render tests for the restored list components (card, form, add button),
 * asserting the **old** markup (`82450ad1:src/components/tier-list/*`).
 * Split from `restored-markup.test.tsx` so L2 owns its own files' tests.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";
import { TooltipProvider } from "@/components/ui/tooltip";
import { stripStyleBlocks } from "@/test-support/markup";

mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/tier-lists/tl-1",
  useSearchParams: () => new URLSearchParams(),
}));
mock.module("nuqs", () => ({
  parseAsStringLiteral: () => ({ withDefault: (value: string) => value }),
  useQueryState: (key: string) => [key === "tab" ? "rankings" : null, () => {}],
}));

const { TierListCard } = await import("./TierListCard");
const { TierListForm } = await import("./TierListForm");
const { AddToTierListButton } = await import("./AddToTierListButton");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
// `TooltipProvider` stands in for the app's own (`AppClientProviders`).
const render = (node: ReactNode) =>
  stripStyleBlocks(
    renderToStaticMarkup(
      <Provider value={client}>
        <TooltipProvider>{node}</TooltipProvider>
      </Provider>,
    ),
  );

describe("TierListCard (restored)", () => {
  test("name, privacy icon, type chip, count, creator", () => {
    const html = render(
      <TierListCard
        tierList={{
          __typename: "TierList",
          id: "tl-1",
          name: "Best Bars",
          description: "Where to go",
          privacy: "PUBLIC",
          listType: "wine",
          itemCount: 1,
          createdAt: null,
          createdById: "u1",
          createdBy: { id: "u1", displayName: "Pat", avatarUrl: null },
        }}
      />,
    );
    assert.match(html, /href="\/tier-lists\/tl-1"/);
    assert.match(html, /href="\/tier-lists\/tl-1"[\s\S]*>Best Bars</);
    assert.match(html, />Wines</);
    assert.match(html, />1 item</);
    assert.match(html, />Pat</);
  });

  test("no creator (signed out) reads Unknown user", () => {
    const html = render(
      <TierListCard
        tierList={{
          __typename: "TierList",
          id: "tl-1",
          name: "x",
          description: null,
          privacy: "PRIVATE",
          listType: "place",
          itemCount: 2,
          createdAt: null,
          createdById: "u1",
          createdBy: null,
        }}
      />,
    );
    assert.match(html, />Unknown user</);
    assert.match(html, />2 items</);
  });
});

describe("TierListForm (restored)", () => {
  test("create: Name, Description, Privacy, List Type", () => {
    const html = render(<TierListForm onSubmitted={() => {}} />);
    for (const label of ["Name", "Description", "Privacy", "List Type"]) {
      assert.match(html, new RegExp(`>${label}<`));
    }
    assert.match(html, /placeholder="e.g. Best Wine Bars"/);
    // The Select renders its options in a portal, so the default (place)
    // is not in static markup; the field itself is.
    assert.match(html, /name="list_type"/);
    assert.match(html, />Create</);
  });

  test("edit: no List Type, Save", () => {
    const html = render(<TierListForm id="tl-1" onSubmitted={() => {}} />);
    assert.doesNotMatch(html, />List Type</);
    assert.match(html, />Save</);
  });
});

describe("AddToTierListButton (restored)", () => {
  test("the old outlined button", () => {
    const html = render(
      <AddToTierListButton entityId="i1" entityType="wine" entityName="X" />,
    );
    assert.match(html, />Add to Tier List</);
  });
});
