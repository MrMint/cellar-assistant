/**
 * The `/me` hub (D1): the destinations that are no longer tabs, grouped, and
 * the account rows the old side bar's avatar menu held.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/me",
}));
mock.module("next/image", () => ({
  default: (props: { alt: string }) => (
    <span data-next-image="avatar" data-alt={props.alt} />
  ),
}));

const { MeHub, ME_SECTIONS } = await import("./MeHub");
const { textOf } = await import("@/test-support/markup");

const user = { id: "u1", email: "pat@example.test", displayName: "Pat" };
const html = renderToStaticMarkup(<MeHub user={user} />);

/** Every link, in document order, as "label -> href". */
const links = [
  ...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g),
].map(([, href, inner]) => `${textOf(inner ?? "")} -> ${href}`);

describe("MeHub", () => {
  test("the viewer's name is the page heading, with their email under it", () => {
    assert.match(html, /<h1\b[^>]*>Pat<\/h1>/);
    assert.ok(html.includes("pat@example.test"));
  });

  test("Lists (Tier lists, Top rated, Loved, Want to try), Friends, Edit profile — in that order", () => {
    assert.deepEqual(links, [
      "Tier lists -> /tier-lists",
      "Top rated -> /rankings",
      "Loved -> /favorites",
      "Want to try -> /want-to-try",
      "Friends -> /friends",
      "Edit profile -> /users/edit",
    ]);
  });

  test("D1: Recipes and Brands are not Me rows (Cellar › Bar, item pages, search)", () => {
    assert.ok(!links.some((link) => link.endsWith("-> /recipes")));
    assert.ok(!links.some((link) => link.endsWith("-> /brands")));
  });

  test("X10: Scans moved to Home's inbox — no Me row for the retired list", () => {
    assert.ok(!links.some((link) => link.endsWith("-> /map/scans")));
  });

  test("your tier lists are pinned first, then All tier lists", () => {
    const pinned = renderToStaticMarkup(
      <MeHub
        user={user}
        data={{
          pinnedTierLists: [
            { id: "t1", name: "Reds, ranked", itemCount: 9 },
            { id: "t2", name: "Whisky wishlist", itemCount: 0 },
          ],
          tierListCount: 4,
          pendingFriendRequests: 0,
        }}
      />,
    );
    const rows = [
      ...pinned.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g),
    ].map(([, href, inner]) => `${textOf(inner ?? "")} -> ${href}`);
    assert.deepEqual(rows.slice(0, 4), [
      "Reds, ranked -> /tier-lists/t1",
      "Whisky wishlist -> /tier-lists/t2",
      "All tier lists -> /tier-lists",
      "Top rated -> /rankings",
    ]);
    assert.ok(textOf(pinned).includes("9 entries"));
    // An empty list says nothing rather than "0 entries".
    assert.ok(!textOf(pinned).includes("0 entries"));
    assert.ok(textOf(pinned).includes("4 of yours"));
  });

  test("Friends carries a badge for pending requests, said in words to AT", () => {
    const badged = renderToStaticMarkup(
      <MeHub
        user={user}
        data={{
          pinnedTierLists: [],
          tierListCount: 0,
          pendingFriendRequests: 2,
        }}
      />,
    );
    assert.match(badged, /data-slot="count-badge"[^>]*>2<\/span>/);
    assert.match(textOf(badged), /Friends\s*,\s*2 friend requests/);
    // No badge at zero.
    assert.ok(!html.includes('data-slot="count-badge"'));
  });

  test("section labels, Lists first and Account last", () => {
    const labels = [...html.matchAll(/<h2\b[^>]*>([^<]*)<\/h2>/g)].map(
      (m) => m[1],
    );
    assert.deepEqual(labels, [...ME_SECTIONS.map((s) => s.label), "Account"]);
    assert.equal(labels[0], "Lists");
  });

  test("Sign out is a real button, after Edit profile", () => {
    assert.match(html, /<button\b[^>]*type="button"[^>]*>[\s\S]*?Sign out/);
    assert.ok(html.indexOf("Sign out") > html.indexOf("Edit profile"));
  });

  test("the avatar beside the name is hidden from assistive tech (no second reading)", () => {
    const withPhoto = renderToStaticMarkup(
      <MeHub user={{ ...user, avatarUrl: "https://example.test/a.jpg" }} />,
    );
    assert.match(
      withPhoto,
      /<span\b[^>]*aria-hidden="true"[^>]*data-slot="user-avatar"|<span\b[^>]*data-slot="user-avatar"[^>]*aria-hidden="true"/,
    );
  });

  test("no display name: the email stands in, once", () => {
    const bare = renderToStaticMarkup(
      <MeHub user={{ id: "u2", email: "sam@example.test" }} />,
    );
    assert.match(bare, /<h1\b[^>]*>sam@example\.test<\/h1>/);
    // Not repeated as a second line under itself.
    assert.equal(bare.split("sam@example.test").length - 1, 1);
  });
});
