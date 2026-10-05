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
const { AddItemClient } = await import("./AddItemClient");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  renderToStaticMarkup(<Provider value={client}>{node}</Provider>).replace(
    /<style[^>]*>[^<]*<\/style>/g,
    "",
  );

const cellar = {
  id: "c1",
  name: "Basement",
  createdBy: { id: "u-ana", displayName: "Ana", avatarUrl: "" },
  coOwners: [{ id: "u-bo", displayName: "Bo", avatarUrl: "" }],
  itemCounts: { wines: 3, beers: 0, spirits: 1, coffees: 0, sakes: 0, teas: 2 },
};

describe("CellarCard (restored)", () => {
  test("an InteractiveCard whose title links to the cellar's items", () => {
    const html = render(
      <CellarCard userId="u-zed" cellar={cellar} onEditClick={() => {}} />,
    );
    assert.match(html, /^<div class="MuiCard-root/);
    assert.match(html, /href="\/cellars\/c1\/items"/, "absolute, not relative");
    assert.match(html, /MuiTypography-title-lg[^>]*>Basement</);
  });

  test("edit button only for the creator or a co-owner", () => {
    const stranger = render(
      <CellarCard userId="u-zed" cellar={cellar} onEditClick={() => {}} />,
    );
    const coOwner = render(
      <CellarCard userId="u-bo" cellar={cellar} onEditClick={() => {}} />,
    );
    assert.doesNotMatch(stranger, /MuiIconButton-root/);
    assert.match(coOwner, /MuiIconButton-root/);
  });

  test("creator then co-owners in an AvatarGroup, by initial", () => {
    const html = render(
      <CellarCard userId="u-ana" cellar={cellar} onEditClick={() => {}} />,
    );
    assert.match(html, /MuiAvatarGroup-root/);
    const initials = [...html.matchAll(/MuiAvatar-root[^>]*>([A-Z])</g)].map(
      (m) => m[1],
    );
    assert.deepEqual(initials, ["A", "B"]);
  });

  test("six counts in the old order, zeros dimmed to 0.3", () => {
    const html = render(
      <CellarCard userId="u-ana" cellar={cellar} onEditClick={() => {}} />,
    );
    const counts = [...html.matchAll(/MuiTypography-body-md[^>]*>(\d+)</g)].map(
      (m) => m[1],
    );
    assert.deepEqual(counts, ["3", "0", "1", "0", "0", "2"]);
    assert.equal([...html.matchAll(/<svg/g)].length >= 7, true);
  });
});

describe("CellarForm (restored)", () => {
  const labels = (html: string) =>
    [...html.matchAll(/<label[^>]*>([^<]+)/g)].map((m) => m[1]);

  test("Name, Privacy, Co-Owners; helper text; 'Add' when creating", () => {
    const html = render(<CellarForm friends={[]} onSubmitted={() => {}} />);
    assert.deepEqual(labels(html), ["Name", "Privacy", "Co-Owners"]);
    assert.match(html, /These users will be treated as owners of the cellar\./);
    assert.match(html, /Choose friends\.\.\./);
    assert.match(html, /<button[^>]*type="submit"[^>]*>Add<\/button>/);
    // The privacy default (FRIENDS) is not asserted here: Joy's Select learns
    // its options' labels in an effect, so a server render shows the
    // placeholder. e2e 02 reads the stored value back instead.
  });

  test("'Save' when editing (the old 'Add' here was a bug)", () => {
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
  });
});

describe("AddItemClient (restored)", () => {
  const cards = (html: string) =>
    [...html.matchAll(/MuiTypography-title-lg[^>]*>(\w+)</g)].map((m) => m[1]);

  test("heading, six image cards in the old order, onboarding links", () => {
    const html = render(
      <AddItemClient cellarId="c1" cellarName="Basement" canAdd />,
    );
    assert.match(html, /<h2[^>]*>Add an item to Basement<\/h2>/);
    assert.deepEqual(cards(html), [
      "Wine",
      "Beer",
      "Spirit",
      "Coffee",
      "Sake",
      "Tea",
    ]);
    assert.equal([...html.matchAll(/data-next-image="art"/g)].length, 6);
    assert.match(html, /href="\/cellars\/c1\/wines\/add"/);
    assert.match(html, /href="\/cellars\/c1\/teas\/add"/);
    assert.doesNotMatch(html, /You do not have permission/);
  });

  test("without permission: the old note, and the cards do not link", () => {
    const html = render(
      <AddItemClient cellarId="c1" cellarName="Basement" canAdd={false} />,
    );
    assert.match(
      html,
      /You do not have permission to add items to this cellar\./,
    );
    assert.doesNotMatch(html, /href="\/cellars\/c1\//);
  });

  test("off a cellar it is /add's chooser", () => {
    const html = render(<AddItemClient />);
    assert.match(html, /<h2[^>]*>Add an item<\/h2>/);
    assert.match(html, /href="\/add\/sakes"/);
  });
});
