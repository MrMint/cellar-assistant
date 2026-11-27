/**
 * The `/me` hub (D1, Shell-Me): the header into Edit profile and the gear
 * into Settings, the numbers, then Lists and People, then one Settings row.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";

mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/me",
}));
mock.module("next/image", () => ({
  default: (props: { alt: string }) => (
    <span data-next-image="avatar" data-alt={props.alt} />
  ),
}));

const { MeHub, ME_SECTIONS, SETTINGS_LABEL } = await import("./MeHub");
const { EMPTY_ME_EXTRAS } = await import("./me-hub-data");
const { textOf } = await import("@/test-support/markup");

const client = new Client({ url: "http://localhost/graphql", exchanges: [] });
const render = (node: ReactNode) =>
  renderToStaticMarkup(<Provider value={client}>{node}</Provider>);

const user = { id: "u1", email: "pat@example.test", displayName: "Pat" };
const html = render(<MeHub user={user} />);

/** Every link, in document order, as "label -> href" (unlabelled ones by aria-label). */
const linksOf = (markup: string) =>
  [...markup.matchAll(/<a\b([^>]*)href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map(
    ([, attrs, href, inner]) => {
      const text =
        textOf(inner ?? "") ||
        (attrs?.match(/aria-label="([^"]*)"/)?.[1] ?? "");
      return `${text} -> ${href}`;
    },
  );
const links = linksOf(html);

const noData = {
  pinnedTierLists: [],
  tierListCount: 0,
  pendingFriendRequests: 0,
};

describe("MeHub", () => {
  test("the viewer's name is the page heading and opens Edit profile; the email under it", () => {
    assert.match(
      html,
      /<h1\b[^>]*><a\b[^>]*href="\/users\/edit"[^>]*>Pat<\/a><\/h1>/,
    );
    assert.ok(html.includes("pat@example.test"));
  });

  test("Shell-Me order: header, gear, Lists, People, Settings", () => {
    assert.deepEqual(links, [
      "Pat -> /users/edit",
      "Settings -> /me/settings",
      "Loved -> /favorites",
      "Want to try -> /want-to-try",
      "Tier lists -> /tier-lists",
      "Top rated -> /rankings",
      "Taste profile -> /taste-profile",
      "Friends -> /friends",
      "Add a friend -> /friends#invite-friends",
      "Settings -> /me/settings",
    ]);
  });

  test("Sign out and Edit profile rows live in Settings, not on the hub", () => {
    assert.ok(!textOf(html).includes("Sign out"));
    assert.ok(!links.some((link) => link.startsWith("Edit profile")));
  });

  test("D1: Recipes and Brands are not Me rows (Cellar › Bar, item pages, search)", () => {
    assert.ok(!links.some((link) => link.endsWith("-> /recipes")));
    assert.ok(!links.some((link) => link.endsWith("-> /brands")));
  });

  test("X10: Scans moved to Home's inbox — no Me row for the retired list", () => {
    assert.ok(!links.some((link) => link.endsWith("-> /map/scans")));
  });

  test("your tier lists sit after Want to try, each with its count and band strip", () => {
    const pinned = render(
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
        extras={{
          ...EMPTY_ME_EXTRAS,
          bands: {
            t1: [
              { band: 5, count: 6 },
              { band: 3, count: 3 },
            ],
          },
        }}
      />,
    );
    const rows = linksOf(pinned);
    assert.deepEqual(rows.slice(4, 8), [
      "Reds, ranked -> /tier-lists/t1",
      "Whisky wishlist -> /tier-lists/t2",
      "All tier lists -> /tier-lists",
      "Top rated -> /rankings",
    ]);
    const strips = [...pinned.matchAll(/data-slot="band-strip"/g)];
    assert.equal(strips.length, 1, "an empty list draws no strip");
    assert.match(pinned, /class="bg-band-5" style="flex-grow:6"/);
    assert.match(pinned, /data-slot="row-count"[^>]*>9</);
    assert.match(pinned, /data-slot="row-count"[^>]*>4</);
  });

  test("past BAND_STRIP_MAX entries a list draws no strip (it would be a sample)", () => {
    const big = render(
      <MeHub
        user={user}
        data={{
          pinnedTierLists: [{ id: "t1", name: "Everything", itemCount: 140 }],
          tierListCount: 1,
          pendingFriendRequests: 0,
        }}
        extras={{
          ...EMPTY_ME_EXTRAS,
          bands: { t1: [{ band: 5, count: 100 }] },
        }}
      />,
    );
    assert.ok(!big.includes('data-slot="band-strip"'));
  });

  test("X18: number tiles name each noun and leave out zeros; Logs has no list to open", () => {
    const counted = render(
      <MeHub
        user={user}
        data={{
          ...noData,
          counts: { bottles: 53, logs: 1, places: 0, tierLists: 4 },
          tierListCount: 4,
        }}
      />,
    );
    const tiles = [
      ...counted.matchAll(
        /data-slot="stat-tile"[^>]*><span[^>]*>([^<]*)<\/span><span[^>]*>([^<]*)<\/span>/g,
      ),
    ].map(([, value, label]) => `${value} ${label}`);
    assert.deepEqual(tiles, ["53 Bottles", "1 Log", "4 Tier lists"]);
    const counts = linksOf(counted).filter((link) => /^\d/.test(link));
    assert.deepEqual(counts, [
      "53 Bottles -> /cellars",
      "4 Tier lists -> /tier-lists",
    ]);
    assert.ok(counted.indexOf("me-counts") < counted.indexOf(">Lists<"));
  });

  test("X18: no counts (unread, or all zero) is no tiles at all", () => {
    assert.ok(!html.includes('data-slot="me-counts"'));
    const zeros = render(
      <MeHub
        user={user}
        data={{
          ...noData,
          counts: { bottles: 0, logs: 0, places: 0, tierLists: 0 },
        }}
      />,
    );
    assert.ok(!zeros.includes('data-slot="me-counts"'));
  });

  test("Loved, Want to try and Friends show their counts; none at zero or unread", () => {
    const counted = render(
      <MeHub
        user={user}
        extras={{ ...EMPTY_ME_EXTRAS, loved: 12, wantToTry: 0, friends: 3 }}
      />,
    );
    const shown = [
      ...counted.matchAll(/data-slot="row-count"[^>]*>(\d+)</g),
    ].map((m) => m[1]);
    assert.deepEqual(shown, ["12", "3"]);
    assert.ok(!html.includes('data-slot="row-count"'));
  });

  test("Loved says it holds drinks and recipes", () => {
    assert.ok(textOf(html).includes("Drinks and recipes"));
  });

  test("Friends carries a badge for pending requests, said in words to AT", () => {
    const badged = render(
      <MeHub user={user} data={{ ...noData, pendingFriendRequests: 2 }} />,
    );
    assert.match(badged, /data-slot="count-badge"[^>]*>2<\/span>/);
    assert.match(textOf(badged), /Friends\s*,\s*2 friend requests/);
    assert.ok(!html.includes('data-slot="count-badge"'));
  });

  test("a request waiting on you is a row in People with an outlined Accept", () => {
    const asked = render(
      <MeHub
        user={user}
        extras={{
          ...EMPTY_ME_EXTRAS,
          requests: [
            { id: "r1", userId: "u9", displayName: "Rory", avatarUrl: null },
          ],
        }}
      />,
    );
    const people = asked.slice(asked.indexOf(">People<"));
    assert.ok(people.indexOf("Rory") < people.indexOf(">Friends"));
    assert.ok(people.includes("Wants to be friends"));
    assert.match(
      people,
      /<button\b[^>]*data-variant="outline"[^>]*aria-label="Accept Rory"|<button\b[^>]*aria-label="Accept Rory"[^>]*data-variant="outline"/,
    );
    assert.ok(!html.includes("Wants to be friends"));
  });

  test("section labels: Lists, then People; Settings is the last row", () => {
    const labels = [...html.matchAll(/<h2\b[^>]*>([^<]*)<\/h2>/g)].map(
      (m) => m[1],
    );
    assert.deepEqual(
      labels,
      ME_SECTIONS.map((s) => s.label),
    );
    assert.equal(SETTINGS_LABEL, "Settings");
    assert.ok(links.at(-1)?.startsWith(`${SETTINGS_LABEL} ->`));
  });

  test("the avatar beside the name is hidden from assistive tech (no second reading)", () => {
    const withPhoto = render(
      <MeHub user={{ ...user, avatarUrl: "https://example.test/a.jpg" }} />,
    );
    assert.match(
      withPhoto,
      /<span\b[^>]*aria-hidden="true"[^>]*data-slot="user-avatar"|<span\b[^>]*data-slot="user-avatar"[^>]*aria-hidden="true"/,
    );
  });

  test("no display name: the email stands in, once", () => {
    const bare = render(
      <MeHub user={{ id: "u2", email: "sam@example.test" }} />,
    );
    assert.match(bare, /<h1\b[^>]*><a\b[^>]*>sam@example\.test<\/a><\/h1>/);
    assert.equal(bare.split("sam@example.test").length - 1, 1);
  });
});
