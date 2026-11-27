/**
 * The recipe page's ingredient rows: one formatter's amount, the availability
 * tags and the garnish chip. Split from `bar/bar.test.tsx` so R2, which owns
 * `RecipeIngredientList`, owns its test.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";
import { stripTags } from "@/test-support/markup";

mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/recipes/r1",
  useSearchParams: () => new URLSearchParams(),
}));

const { RecipeIngredientList } = await import("./RecipeIngredientList");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  renderToStaticMarkup(<Provider value={client}>{node}</Provider>);
const text = (html: string) => stripTags(html);

describe("RecipeIngredientList", () => {
  test("ingredient rows: one formatter's amount, tags, and the garnish chip", () => {
    const html = render(
      <RecipeIngredientList
        ingredients={[
          {
            id: "i1",
            amount: "¾ oz",
            quantity: 0.75,
            unit: "oz",
            role: "modifier",
            item: null,
            generic_item: { id: "g1", name: "Sweet vermouth", category: "x" },
            availability: {
              status: "HAVE",
              source: "PANTRY",
              label: "Sweet vermouth",
            },
          },
          {
            id: "i2",
            // An older document without `amount`: the shared formatter.
            quantity: 1.5,
            unit: "oz",
            role: "base",
            item: null,
            generic_item: { id: "g2", name: "Rye", category: "x" },
            availability: {
              status: "SUBSTITUTE",
              source: "BOTTLE",
              label: "Buffalo Trace",
            },
          },
          {
            id: "i3",
            amount: "",
            role: "garnish",
            item: null,
            generic_item: { id: "g3", name: "Cherry", category: "x" },
            availability: { status: "MISSING" },
          },
        ]}
      />,
    );
    assert.match(html, />¾ oz</);
    assert.match(html, />1½ oz</);
    assert.match(text(html), /In your pantry/);
    assert.match(text(html), /Swap: Buffalo Trace/);
    assert.match(html, />Garnish</);
    assert.doesNotMatch(html, />x</, "the generic category chip is gone");

    const quiet = render(
      <RecipeIngredientList
        showAvailability={false}
        ingredients={[
          {
            id: "i1",
            amount: "2 oz",
            item: null,
            generic_item: { id: "g", name: "Gin" },
            availability: { status: "MISSING" },
          },
        ]}
      />,
    );
    assert.doesNotMatch(quiet, /data-availability/);
  });
});
