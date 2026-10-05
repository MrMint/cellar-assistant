/**
 * The invariants `/brands/[brandId]` relies on and nothing else checks.
 *
 * `documents.test.ts` already validates every operation `queries.ts` exports
 * against the checked-in SDL, so this file deliberately does **not** repeat
 * that. What it covers is the layer below a
 * valid document: argument *values*, and the specific selections the view's
 * honesty depends on.
 *
 * Three things here that a green `tsc` does not imply:
 *
 * 1. **A `first` over 100 is a `VALIDATION` error, not a clamp**, and on this
 *    page it is the worst-shaped kind. The cap is documented in the SDL's own
 *    argument descriptions and cannot be enforced against a constant, because
 *    a constant is a value and gql.tada types documents, not values. Measured
 *    against the running API: `brands(first: 101)` answers with a
 *    `ValidationError` *member* — that field is a result union — but
 *    `Brand.itemLinks(first: 101)` is a plain `ItemBrandConnection!` and answers with a
 *    **top-level** GraphQL error and `data: null`. One number over the cap
 *    therefore does not truncate the item list; it blanks the whole brand
 *    page, header and all, through the route's error boundary.
 * 2. **Deleting a reverse edge from the document is silent.** `itemLinks`,
 *    `places` and `childBrands` are read through `readFragment` in components
 *    that would then render an empty list, which is precisely the state this
 *    page was in before A7g's edges were wired up. The regression is a page
 *    that says a producer has nothing, so it is asserted rather than trusted.
 * 3. **`totalCount` and `pageInfo` are what make the counts true.** The view
 *    renders "12 of 87" and a "Show more" button off these; a connection that
 *    reports only what it returned makes both of them lie.
 *
 * This file used to end with two checks against a running API — that a
 * missing brand is a `NotFoundError` *member* with no top-level `errors`, and
 * that `first: 101` is refused rather than clamped. Both are claims about the
 * server, so they live with it now and run in every API suite instead of
 * skipping here whenever the stack is down:
 * `services/api/src/schema/brand.test.ts` ("puts a NotFoundError from the
 * loader on QueryBrandResult, not at the top level") and
 * `services/api/src/schema/schema.test.ts` ("raises a typed VALIDATION on a
 * plain connection field").
 *
 *   bun run --filter @cellar-assistant/client test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { type DocumentNode, Kind, print, visit } from "graphql";
import {
  BRAND_CHILDREN_PAGE_SIZE,
  BRAND_ITEMS_PAGE_SIZE,
  BRAND_PLACES_PAGE_SIZE,
  BRANDS_PAGE_SIZE,
  BrandDetailQuery,
  BrandItemLinksPageQuery,
} from "./queries";

/**
 * The cap every connection argument on `Brand` documents in its own
 * description: "1 to 100 inclusive". Over it is a `VALIDATION` error.
 */
const CONNECTION_CAP = 100;

/**
 * Every field selected anywhere in a document, by name.
 *
 * A flat set rather than a path walk: the assertions below only ask whether a
 * selection exists at all, and `itemLinks` can only appear under `Brand` in these
 * two documents.
 */
const selectedFields = (document: unknown): Set<string> => {
  const names = new Set<string>();
  visit(document as DocumentNode, {
    [Kind.FIELD]: (node) => {
      names.add(node.name.value);
    },
  });
  return names;
};

/** The names of the variables a field's `first:` argument is wired to. */
const firstArgumentVariables = (document: unknown): Map<string, string> => {
  const wiring = new Map<string, string>();
  visit(document as DocumentNode, {
    [Kind.FIELD]: (node) => {
      for (const argument of node.arguments ?? []) {
        if (argument.name.value !== "first") continue;
        if (argument.value.kind === Kind.VARIABLE) {
          wiring.set(node.name.value, argument.value.name.value);
        }
      }
    },
  });
  return wiring;
};

describe("A7g brand reverse-edge documents", () => {
  test("every brand page size is inside the connection cap", () => {
    // Not a tautology against the constants' literals: this is the assertion
    // that fires when someone raises a page size to "just fetch them all".
    for (const [name, size] of [
      ["BRANDS_PAGE_SIZE", BRANDS_PAGE_SIZE],
      ["BRAND_ITEMS_PAGE_SIZE", BRAND_ITEMS_PAGE_SIZE],
      ["BRAND_PLACES_PAGE_SIZE", BRAND_PLACES_PAGE_SIZE],
      ["BRAND_CHILDREN_PAGE_SIZE", BRAND_CHILDREN_PAGE_SIZE],
    ] as const) {
      assert.ok(
        Number.isInteger(size) && size >= 1 && size <= CONNECTION_CAP,
        `${name} is ${size}; the API accepts 1-${CONNECTION_CAP} and errors past it`,
      );
    }
  });

  test("items are paged more tightly than the two free edges", () => {
    // `Brand.itemLinks` is the only edge that costs an `ItemActor.get` per row;
    // `childBrands` and `places` are one collection call each. If these ever
    // equalise, someone has lost that distinction — which is the difference
    // between one actor call and a hundred on first paint.
    assert.ok(
      BRAND_ITEMS_PAGE_SIZE < BRAND_CHILDREN_PAGE_SIZE,
      "items should page smaller than childBrands: items cost one actor call each",
    );
    assert.ok(
      BRAND_ITEMS_PAGE_SIZE < BRAND_PLACES_PAGE_SIZE,
      "items should page smaller than places: places arrive joined, items do not",
    );
  });

  test("BrandDetailQuery still selects all four reverse edges", () => {
    const fields = selectedFields(BrandDetailQuery);
    for (const edge of ["parentBrand", "childBrands", "itemLinks", "places"]) {
      assert.ok(
        fields.has(edge),
        `BrandDetailQuery no longer selects ${edge}; /brands/[brandId] renders that section empty`,
      );
    }
  });

  test("BrandDetailQuery counts are real, not the length of what came back", () => {
    const fields = selectedFields(BrandDetailQuery);
    assert.ok(
      fields.has("totalCount"),
      "BrandDetailQuery must select totalCount; the view renders 'N of M'",
    );
    assert.ok(
      fields.has("hasNextPage") && fields.has("endCursor"),
      "BrandDetailQuery must select pageInfo; 'Show more' pages from endCursor",
    );
  });

  test("the three page sizes reach the server as variables", () => {
    // A literal `first: 12` in the document would make the constants above
    // decorative, and the cap assertion would then be checking a number the
    // API never sees.
    const wiring = firstArgumentVariables(BrandDetailQuery);
    assert.deepEqual(
      {
        itemLinks: wiring.get("itemLinks"),
        places: wiring.get("places"),
        childBrands: wiring.get("childBrands"),
      },
      {
        itemLinks: "itemsFirst",
        places: "placesFirst",
        childBrands: "childrenFirst",
      },
    );
  });

  test("BrandItemLinksPageQuery pages items and nothing else", () => {
    const fields = selectedFields(BrandItemLinksPageQuery);
    assert.ok(
      fields.has("itemLinks"),
      "the paging document must select itemLinks",
    );
    for (const sibling of ["places", "childBrands", "parentBrand"]) {
      assert.ok(
        !fields.has(sibling),
        `BrandItemLinksPageQuery re-reads ${sibling}; a 'Show more' on items should not page a sibling list`,
      );
    }
  });

  test("both documents narrow the brand union", () => {
    // `brand(id:)` is a result union, and a union error does NOT set URQL's
    // `result.error`. Both documents therefore have to select `__typename`
    // and an `...ActorErrorFields` branch or the consumer has nothing to
    // discriminate on and renders the error object as data.
    for (const [name, document] of [
      ["BrandDetailQuery", BrandDetailQuery],
      ["BrandItemLinksPageQuery", BrandItemLinksPageQuery],
    ] as const) {
      const text = print(document as never);
      assert.match(
        text,
        /__typename/,
        `${name} must select __typename on the brand union`,
      );
      assert.match(
        text,
        /\.\.\.ActorErrorFields\b/,
        `${name} must carry an ActorError branch (...ActorErrorFields)`,
      );
    }
  });
});
