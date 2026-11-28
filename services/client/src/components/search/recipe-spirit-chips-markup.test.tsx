/**
 * F-114 (H-87): `/recipes`' spirit chips render from `recipeBaseSpiritCounts`
 * — only the kinds present, each with its count — and never the static
 * bar vocabulary. urql's `useQuery` answers the counts and nothing else.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

const actual = await import("urql");

let counts: { baseSpirit: string; count: number }[] = [];
const asked: unknown[] = [];

mock.module("urql", () => ({
  ...actual,
  useQuery: (args: {
    query: { definitions?: { name?: { value?: string } }[] };
    variables?: unknown;
  }) => {
    const name = args.query.definitions?.[0]?.name?.value;
    if (name !== "RecipeBaseSpiritCounts")
      return [{ fetching: false }, () => {}];
    asked.push(args.variables);
    return [
      {
        fetching: false,
        data: {
          recipeBaseSpiritCounts: {
            __typename: "RecipeBaseSpiritCountConnection",
            edges: counts.map((node) => ({ node })),
          },
        },
      },
      () => {},
    ];
  },
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/recipes",
  useSearchParams: () => new URLSearchParams(),
}));

const { Client, Provider } = actual;
const { RecipeGroupSearch } = await import("./RecipeGroupSearch");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = () =>
  renderToStaticMarkup(
    <Provider value={client}>
      <RecipeGroupSearch
        initialEdges={[]}
        initialEndCursor={null}
        initialHasNextPage={false}
        initialTotalCount={0}
      />
    </Provider>,
  );

const chipTexts = (html: string) =>
  [
    ...html.matchAll(
      /<button[^>]*data-slot="filter-chip"[^>]*>(.*?)<\/button>/g,
    ),
  ]
    .map((match) => (match[1] ?? "").replace(/<[^>]+>/g, " ").trim())
    .map((text) => text.replace(/\s+/g, " "));

describe("RecipeGroupSearch spirit chips (F-114)", () => {
  test("only the kinds the recipes hold, each with its count", () => {
    counts = [
      { baseSpirit: "gin", count: 3 },
      { baseSpirit: "rum", count: 1 },
    ];
    const chips = chipTexts(render());
    // The kind (category) chip, then one chip per counted spirit.
    assert.deepEqual(chips.slice(1), ["Gin 3", "Rum 1"]);
    assert.ok(!chips.some((chip) => chip.startsWith("Vodka")));
  });

  test("asks for the counts under the page's category and term", () => {
    asked.length = 0;
    counts = [];
    render();
    assert.deepEqual(asked.at(-1), { first: 50, category: null, term: null });
  });

  test("no counts: no spirit chips at all", () => {
    counts = [];
    assert.equal(chipTexts(render()).length, 1);
  });
});
