/**
 * Render tests for the restored cellar components, asserting the **old**
 * markup (`82450ad1:src/components/cellar/*`): copy, labels, order and
 * structure, server-rendered with `react-dom/server` the way the first paint
 * is. `next/image` is stubbed because bun imports a `.png` as a path string.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";
import { stripStyleBlocks } from "@/test-support/markup";

mock.module("next/image", () => ({
  default: (props: { alt: string }) => (
    <span data-next-image="art" data-alt={props.alt} />
  ),
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, back: () => {} }),
  usePathname: () => "/cellars",
}));

const { CellarCard } = await import("./CellarCard");
const { CellarForm } = await import("./CellarForm");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  stripStyleBlocks(
    renderToStaticMarkup(<Provider value={client}>{node}</Provider>),
  );

const cellar = {
  id: "c1",
  name: "Basement",
  createdBy: { id: "u-ana", displayName: "Ana", avatarUrl: "" },
  coOwners: [{ id: "u-bo", displayName: "Bo", avatarUrl: "" }],
  itemCounts: { wines: 3, beers: 0, spirits: 1, coffees: 0, sakes: 0, teas: 2 },
};

describe("CellarCard (restored)", () => {
  test("a card whose title links to the cellar's items", () => {
    const html = render(
      <CellarCard userId="u-zed" cellar={cellar} onEditClick={() => {}} />,
    );
    assert.ok(
      html.indexOf("/cellars/c1/items") < html.indexOf('aria-label="Wines"'),
      "the title leads, the counts follow",
    );
    assert.match(html, /href="\/cellars\/c1\/items"/, "absolute, not relative");
    assert.match(
      html,
      /href="\/cellars\/c1\/items"[^>]*>(?:<[^>]+>)*Basement</,
    );
  });

  test("edit button only for the creator or a co-owner", () => {
    const stranger = render(
      <CellarCard userId="u-zed" cellar={cellar} onEditClick={() => {}} />,
    );
    const coOwner = render(
      <CellarCard userId="u-bo" cellar={cellar} onEditClick={() => {}} />,
    );
    assert.doesNotMatch(stranger, /<button[^>]*aria-label="Edit Cellar"/);
    assert.match(coOwner, /<button[^>]*aria-label="Edit Cellar"/);
  });

  test("creator then co-owners beside the title, by initial", () => {
    const html = render(
      <CellarCard userId="u-ana" cellar={cellar} onEditClick={() => {}} />,
    );
    const owners = html.slice(
      html.indexOf(">Basement<") + ">Basement<".length,
      html.indexOf('aria-label="Wines"'),
    );
    assert.ok(owners.length > 0, "the avatars sit between title and counts");
    const initials = [...owners.matchAll(/>([A-Z])</g)].map((m) => m[1]);
    assert.deepEqual(initials, ["A", "B"]);
  });

  test("six counts in the old order, zeros dimmed to 0.3", () => {
    const html = render(
      <CellarCard userId="u-ana" cellar={cellar} onEditClick={() => {}} />,
    );
    const counts = [
      ...html.matchAll(
        /aria-label="(Wines|Beers|Spirits|Coffees|Sakes|Teas)"[^>]*>[\s\S]*?>(\d+)</g,
      ),
    ].map((m) => `${m[1]} ${m[2]}`);
    assert.deepEqual(counts, [
      "Wines 3",
      "Beers 0",
      "Spirits 1",
      "Coffees 0",
      "Sakes 0",
      "Teas 2",
    ]);
    assert.equal([...html.matchAll(/<svg/g)].length >= 7, true);
    const dimmed = [
      ...html.matchAll(
        /<span[^>]*class="([^"]*)"[^>]*><svg[^>]*aria-label="(\w+)"/g,
      ),
    ]
      .filter((m) => /\bopacity-30\b/.test(m[1] ?? ""))
      .map((m) => m[2]);
    assert.deepEqual(dimmed, ["Beers", "Coffees", "Sakes"], "only the zeros");
  });
});

describe("CellarForm (lot-cellars-shelves-03)", () => {
  const labels = (html: string) =>
    [...html.matchAll(/<label[^>]*>([^<]+)/g)].map((m) => m[1]);

  test("Name, Who sees it (Friends by default), Co-owners; Cancel and Make cellar", () => {
    const html = render(
      <CellarForm friends={[]} onSubmitted={() => {}} onCancel={() => {}} />,
    );
    assert.deepEqual(labels(html), ["Name", "Co-owners"]);
    assert.match(html, /role="radiogroup"[^>]*aria-label="Who sees it"/);
    assert.match(
      html,
      /aria-checked="true"[^>]*>(?:<[^>]+>)*Friends|Friends(?:<[^>]+>)*[^<]*aria-checked="true"/,
    );
    assert.match(html, /Your friends can look/);
    assert.match(html, />None</);
    assert.match(html, /<button[^>]*type="button"[^>]*>Cancel<\/button>/);
    assert.match(html, /<button[^>]*type="submit"[^>]*>Make cellar<\/button>/);
  });

  test("'Save' when editing, with the stored privacy's line", () => {
    const html = render(
      <CellarForm
        id="c1"
        defaults={{ name: "Basement", privacy: "PRIVATE", co_owners: [] }}
        friends={[]}
        onSubmitted={() => {}}
      />,
    );
    assert.match(html, /<button[^>]*type="submit"[^>]*>Save<\/button>/);
    assert.match(html, /value="Basement"/);
    assert.match(html, /Only you and co-owners/);
    assert.doesNotMatch(html, />Cancel</);
  });
});

describe("Delete cellar: refused while it holds bottles", async () => {
  const { deleteRefusal } = await import("../cellar-api/DeleteCellarButton");
  test("the refusal's words; none for an empty cellar", () => {
    assert.equal(deleteRefusal(240), "Holds 240 bottles. Empty it first.");
    assert.equal(deleteRefusal(1), "Holds 1 bottle. Empty it first.");
    assert.equal(deleteRefusal(0), null);
  });
});
