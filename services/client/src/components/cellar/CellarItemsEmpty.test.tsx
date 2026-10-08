/**
 * The items grid's empty states (design §3.6): which one shows, its one
 * line, and that "Add a bottle" — the only action — appears only for an
 * empty cellar you may add to.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { nextImageModule } from "../../test-support/next-image";

mock.module("next/image", () => nextImageModule("art"));

const { CellarItemsEmpty, cellarItemsEmptyCopy } = await import(
  "./CellarItemsEmpty"
);

describe("cellarItemsEmptyCopy", () => {
  const base = { search: "", types: [], canAdd: true } as const;

  test("an empty cellar: waiting, with the cellar art and Add", () => {
    assert.deepEqual(cellarItemsEmptyCopy(base), {
      title: "Your cellar is waiting.",
      description: "Add a bottle and it shows up here.",
      art: "cellar",
      addAction: true,
    });
    // A friend's cellar: not "your" cellar, and no Add for a viewer who
    // cannot add to it.
    assert.deepEqual(cellarItemsEmptyCopy({ ...base, canAdd: false }), {
      title: "No bottles here yet.",
      description: "Bottles its owners add show up here.",
      art: "cellar",
      addAction: false,
    });
    assert.equal(
      cellarItemsEmptyCopy({ ...base, status: "all" }).title,
      "Your cellar is waiting.",
    );
  });

  test("a search beats everything else", () => {
    const copy = cellarItemsEmptyCopy({
      ...base,
      search: "smoky",
      types: ["WINE"],
      status: "finished",
    });
    assert.equal(copy.title, "Nothing matches that.");
    assert.equal(copy.addAction, false);
  });

  test("one type: that type's illustration and word", () => {
    assert.deepEqual(cellarItemsEmptyCopy({ ...base, types: ["SAKE"] }), {
      title: "No sake in here.",
      description: "Clear the filter to see every bottle.",
      art: "SAKE",
      addAction: false,
    });
    assert.equal(
      cellarItemsEmptyCopy({ ...base, types: ["TEA"], status: "finished" })
        .title,
      "No finished tea yet.",
    );
  });

  test("several types; nothing finished", () => {
    assert.equal(
      cellarItemsEmptyCopy({ ...base, types: ["WINE", "BEER"] }).title,
      "No bottles of those types.",
    );
    assert.equal(
      cellarItemsEmptyCopy({ ...base, status: "finished" }).title,
      "Nothing finished yet.",
    );
  });
});

describe("CellarItemsEmpty", () => {
  test("an empty cellar you own: one line, one Add link to the add page", () => {
    const html = renderToStaticMarkup(
      <CellarItemsEmpty cellarId="c1" canAdd search="" types={[]} />,
    );
    assert.match(html, />Your cellar is waiting\.</);
    assert.match(html, /data-next-image="art"/);
    const links = [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(
      (match) => match[1],
    );
    assert.deepEqual(links, ["/cellars/c1/items/add"]);
    assert.match(html, />Add a bottle</);
  });

  test("nothing finished: no action at all", () => {
    const html = renderToStaticMarkup(
      <CellarItemsEmpty
        cellarId="c1"
        canAdd
        search=""
        types={[]}
        status="finished"
      />,
    );
    assert.match(html, />Nothing finished yet\.</);
    assert.doesNotMatch(html, /<a\b|<button\b/);
  });
});
