import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { generateBreadcrumbs, pageHeader } from "./breadcrumbs";

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

  test("a standalone item path keeps the type crumb, as a label (D7: no index page)", () => {
    assert.deepEqual(generateBreadcrumbs(`/beers/${I}`, undefined, "Pils"), [
      { label: "Home", href: "/" },
      { label: "Beers" },
      { label: "Pils", href: undefined },
    ]);
  });

  test("sake and tea get the item crumb the old four-type list dropped", () => {
    assert.deepEqual(generateBreadcrumbs(`/sakes/${I}`, undefined, "Dassai"), [
      { label: "Home", href: "/" },
      { label: "Sakes" },
      { label: "Dassai", href: undefined },
    ]);
    assert.deepEqual(generateBreadcrumbs(`/teas/${I}/edit`), [
      { label: "Home", href: "/" },
      { label: "Teas" },
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
      generateBreadcrumbs(`/discoveries/${I}`).map((b) => b.label),
      ["Home", "Discoveries"],
    );
  });

  test("tier lists read as words, not the title-cased slug", () => {
    assert.deepEqual(
      generateBreadcrumbs(`/tier-lists/${I}`).map((b) => b.label),
      ["Home", "Tier lists"],
    );
  });

  test("a leading (authenticated) group segment is skipped", () => {
    assert.deepEqual(
      generateBreadcrumbs("/(authenticated)/favorites").map((b) => b.label),
      ["Home", "Loved"],
    );
  });
});

describe("pageHeader — the phone's Back and title", () => {
  const header = (
    path: string,
    names?: Parameters<typeof generateBreadcrumbs>,
  ) => pageHeader(path, generateBreadcrumbs(...(names ?? [path])));

  test("a tab root has a title and no Back", () => {
    assert.deepEqual(header("/cellars"), { title: "Cellars", tabRoot: true });
    assert.equal(header("/me").tabRoot, true);
    assert.equal(header("/map").tabRoot, true);
  });

  test("/search, where Home lands, is Home's root", () => {
    assert.equal(header("/search").tabRoot, true);
    assert.equal(header("/search").parent, undefined);
  });

  test("a cellar's items: titled by the cellar, Back to the cellars list", () => {
    const path = `/cellars/${C}/items`;
    assert.deepEqual(header(path, [path, "Home bar"]), {
      title: "Home bar",
      parent: "/cellars",
      tabRoot: false,
    });
  });

  test("a bottle in a cellar goes back to that cellar's items", () => {
    const path = `/cellars/${C}/wines/${I}`;
    assert.deepEqual(header(path, [path, "Home bar", "Barolo"]), {
      title: "Barolo",
      parent: `/cellars/${C}/items`,
      tabRoot: false,
    });
  });

  test("an edit page names what it edits", () => {
    const path = `/wines/${I}/edit`;
    assert.equal(
      header(path, [path, undefined, "Barolo"]).title,
      "Edit Barolo",
    );
    assert.equal(
      header(path, [path, undefined, "Barolo"]).parent,
      `/wines/${I}`,
    );
  });

  test("lists that moved under Me (D1) go back to /me, not Home", () => {
    assert.equal(header("/tier-lists").parent, "/me");
    assert.equal(header("/favorites").parent, "/me");
    assert.equal(header("/rankings").parent, "/me");
  });

  test("a page outside the tabs still goes back Home", () => {
    assert.equal(header(`/wines/${I}`).parent, "/");
  });
});
