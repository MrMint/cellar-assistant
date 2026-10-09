/**
 * A friend's profile (X18) as a person — or VoiceOver — meets it on first
 * paint: one h1 (their name), the sections that have something in them and
 * none that do not, every row a link into what was shared, and one empty
 * state when nothing is.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";

mock.module("next/navigation", () => ({
  useRouter: () => ({
    replace: () => {},
    push: () => {},
    refresh: () => {},
    back: () => {},
  }),
  usePathname: () => "/users/f1",
  useSearchParams: () => new URLSearchParams(),
}));
mock.module("next/image", () => ({
  default: (props: { alt: string }) => (
    <span data-next-image="photo" data-alt={props.alt} />
  ),
}));

const { FriendProfile } = await import("./FriendProfile");
const { textOf } = await import("@/test-support/markup");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  renderToStaticMarkup(<Provider value={client}>{node}</Provider>);

const base = {
  userId: "f1",
  name: "Sam",
  avatarUrl: null,
  sinceLine: "Friends since Mar 2026",
  tierLists: [],
  tierListCount: 0,
  cellars: [],
  cellarCount: 0,
  logs: { rows: [], endCursor: null, hasNextPage: false, totalCount: 0 },
} as const;

const links = (html: string) =>
  [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map(
    ([, href, inner]) => `${textOf(inner ?? "")} -> ${href}`,
  );

describe("FriendProfile", () => {
  test("their name is the one h1, with when you became friends", () => {
    const html = render(<FriendProfile view={base} />);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.match(html, /<h1\b[^>]*>Sam<\/h1>/);
    assert.ok(textOf(html).includes("Friends since Mar 2026"));
  });

  test("nothing shared is one empty state, and no empty sections", () => {
    const html = render(<FriendProfile view={base} />);
    assert.ok(textOf(html).includes("Nothing shared yet."));
    assert.ok(!html.includes("data-section="));
  });

  test("each shared thing is a link; empty sections are not drawn", () => {
    const html = render(
      <FriendProfile
        view={{
          ...base,
          tierLists: [
            {
              id: "t1",
              name: "Reds, ranked",
              href: "/tier-lists/t1",
              description: "9 entries · Public",
            },
          ],
          tierListCount: 1,
          logs: {
            rows: [
              {
                id: "e1",
                createdAt: "2026-10-05T12:00:00.000Z",
                title: "2016 Barolo",
                href: "/wines/w1",
                itemType: "WINE",
                score: 4.5,
                note: "Smoky",
                tags: ["smoke"],
                context: "at Cork and Barrel",
              },
            ],
            endCursor: "k:1",
            hasNextPage: true,
            totalCount: 3,
          },
        }}
      />,
    );
    assert.ok(!textOf(html).includes("Nothing shared yet."));
    assert.ok(html.includes('data-section="tier-lists"'));
    assert.ok(!html.includes('data-section="cellars"'));
    assert.ok(html.includes('data-section="logs"'));
    assert.deepEqual(
      links(html).filter((link) => !link.endsWith("-> /friends")),
      ["Reds, ranked -> /tier-lists/t1", "2016 Barolo -> /wines/w1"],
    );
    const text = textOf(html);
    assert.ok(text.includes("Smoky"));
    assert.ok(text.includes("at Cork and Barrel"));
    // More to read: the log offers it.
    assert.match(html, /<button\b[^>]*>Show more<\/button>/);
  });

  test("nothing on the page edits: no form, no destructive control", () => {
    const html = render(<FriendProfile view={base} />);
    assert.ok(!html.includes("<form"));
    assert.ok(!/Remove|Delete|Edit/.test(textOf(html)));
  });
});
