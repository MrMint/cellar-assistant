import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { generateBreadcrumbs } from "./breadcrumbs";

const C = "0b9a1c52-6a0e-4d33-9a43-7f1e2c3d4e5f";
const I = "4f7e2a10-1b2c-4d5e-8f90-a1b2c3d4e5f6";

describe("generateBreadcrumbs — the old ServerBreadcrumbs rule", () => {
  test("root is just Home", () => {
    assert.deepEqual(generateBreadcrumbs("/"), [{ label: "Home", href: "/" }]);
  });

  test("the last crumb has no href", () => {
    assert.deepEqual(generateBreadcrumbs("/cellars"), [
      { label: "Home", href: "/" },
      { label: "Cellars", href: undefined },
    ]);
  });

  test("a cellar crumb links to its items page and uses the given name", () => {
    assert.deepEqual(generateBreadcrumbs(`/cellars/${C}/items`, "Home bar"), [
      { label: "Home", href: "/" },
      { label: "Cellars", href: "/cellars" },
      { label: "Home bar", href: `/cellars/${C}/items` },
      { label: "Items", href: undefined },
    ]);
  });

  test("a cellar item path skips the type crumb and names the item", () => {
    assert.deepEqual(
      generateBreadcrumbs(`/cellars/${C}/wines/${I}`, "Bar", "Barolo"),
      [
        { label: "Home", href: "/" },
        { label: "Cellars", href: "/cellars" },
        { label: "Bar", href: `/cellars/${C}/items` },
        { label: "Barolo", href: undefined },
      ],
    );
  });

  test("a standalone item path keeps the type crumb", () => {
    assert.deepEqual(generateBreadcrumbs(`/beers/${I}`, undefined, "Pils"), [
      { label: "Home", href: "/" },
      { label: "Beers", href: "/beers" },
      { label: "Pils", href: undefined },
    ]);
  });

  test("sake and tea get the item crumb the old four-type list dropped", () => {
    assert.deepEqual(generateBreadcrumbs(`/sakes/${I}`, undefined, "Dassai"), [
      { label: "Home", href: "/" },
      { label: "Sakes", href: "/sakes" },
      { label: "Dassai", href: undefined },
    ]);
    assert.deepEqual(generateBreadcrumbs(`/teas/${I}/edit`), [
      { label: "Home", href: "/" },
      { label: "Teas", href: "/teas" },
      { label: "Item", href: `/teas/${I}` },
      { label: "Edit" },
    ]);
  });

  test("defaults when no names are passed", () => {
    const labels = generateBreadcrumbs(`/cellars/${C}/spirits/${I}`).map(
      (b) => b.label,
    );
    assert.deepEqual(labels, ["Home", "Cellars", "Cellar", "Item"]);
  });

  test("recipes, users and the fixed labels", () => {
    assert.deepEqual(
      generateBreadcrumbs(`/recipes/${I}`, undefined, undefined, "Negroni").map(
        (b) => b.label,
      ),
      ["Home", "Recipes", "Negroni"],
    );
    assert.deepEqual(
      generateBreadcrumbs("/users/edit").map((b) => b.label),
      ["Home", "Profile", "Edit"],
    );
    assert.deepEqual(
      generateBreadcrumbs("/cellars/add").map((b) => b.label),
      ["Home", "Cellars", "Add"],
    );
  });

  test("a recipe group page: no dead /recipes/groups crumb", () => {
    assert.deepEqual(
      generateBreadcrumbs(
        `/recipes/groups/${I}`,
        undefined,
        undefined,
        "Negroni",
      ),
      [
        { label: "Home", href: "/" },
        { label: "Recipes", href: "/recipes" },
        { label: "Negroni", href: undefined },
      ],
    );
    assert.deepEqual(
      generateBreadcrumbs(`/recipes/groups/${I}/versions`).map((b) => b.href),
      ["/", "/recipes", `/recipes/groups/${I}`, undefined],
    );
  });

  test("unknown segments are title-cased; unknown uuids are dropped", () => {
    assert.deepEqual(
      generateBreadcrumbs(`/tier-lists/${I}`).map((b) => b.label),
      ["Home", "Tier-lists"],
    );
  });

  test("a leading (authenticated) group segment is skipped", () => {
    assert.deepEqual(
      generateBreadcrumbs("/(authenticated)/favorites").map((b) => b.label),
      ["Home", "Favorites"],
    );
  });
});
