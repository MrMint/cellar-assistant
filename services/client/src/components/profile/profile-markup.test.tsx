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
const { openTag, textOf } = await import("@/test-support/markup");

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
  tierLists: { rows: [], endCursor: null, hasNextPage: false, totalCount: 0 },
  cellars: { rows: [], endCursor: null, hasNextPage: false, totalCount: 0 },
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
    assert.ok(textOf(html).includes("Nothing shared yet"));
    assert.ok(!html.includes("data-section="));
  });

  test("each shared thing is a link; empty sections are not drawn", () => {
    const html = render(
      <FriendProfile
        view={{
          ...base,
          tierLists: {
            rows: [
              {
                id: "t1",
                name: "Reds, ranked",
                href: "/tier-lists/t1",
                description: "9 entries · Public",
              },
            ],
            endCursor: "t:1",
            hasNextPage: false,
            totalCount: 1,
          },
          logs: {
            rows: [
              {
                id: "e1",
                kind: "item",
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
    assert.ok(!textOf(html).includes("Nothing shared yet"));
    assert.ok(html.includes('data-section="tier-lists"'));
    assert.ok(!html.includes('data-section="cellars"'));
    assert.ok(html.includes('data-section="logs"'));
    assert.deepEqual(
      links(html).filter(
        (link) => !/-> \/(friends|me|users\/f1\/compare)$/.test(link),
      ),
      ["Reds, ranked -> /tier-lists/t1", "2016 Barolo -> /wines/w1"],
    );
    const text = textOf(html);
    assert.ok(text.includes("Smoky"));
    assert.ok(text.includes("at Cork and Barrel"));
    // More to read: the log offers it.
    assert.match(html, /<button\b[^>]*>Show more<\/button>/);
  });

  test("a list or cellar section with more than its first page offers Show more (leftovers 6)", () => {
    const rows = (prefix: string, href: string) =>
      Array.from({ length: 20 }, (_, index) => ({
        id: `${prefix}${index}`,
        name: `${prefix} ${index}`,
        href: `${href}/${prefix}${index}`,
        description: "Public",
      }));
    const html = render(
      <FriendProfile
        view={{
          ...base,
          tierLists: {
            rows: rows("t", "/tier-lists"),
            endCursor: "t:19",
            hasNextPage: true,
            totalCount: 26,
          },
          cellars: {
            rows: rows("c", "/cellars"),
            endCursor: "c:19",
            hasNextPage: true,
            totalCount: 21,
          },
        }}
      />,
    );
    for (const section of ["tier-lists", "cellars"]) {
      const start = html.indexOf(`data-section="${section}"`);
      assert.ok(start >= 0, `${section} is drawn`);
      const rest = html.slice(start);
      const next = rest.indexOf("data-section=", 1);
      const own = next < 0 ? rest : rest.slice(0, next);
      assert.match(own, /<button\b[^>]*>Show more<\/button>/, section);
    }
    assert.ok(!textOf(html).includes("Showing 20 of"));
  });

  test("the one write is Remove friend, at the foot, behind a confirm", () => {
    const html = render(<FriendProfile view={base} />);
    assert.ok(!html.includes("<form"));
    assert.ok(!/Delete|Edit/.test(textOf(html)));
    assert.match(html, /<button\b[^>]*>[\s\S]*?Remove friend<\/button>/);
    // The confirm is closed on first paint: nothing destructive is drawn.
    assert.ok(!html.includes('role="alertdialog"'));
  });

  test("the agreement card keeps #compare and opens the compare screen", () => {
    const html = render(<FriendProfile view={base} />);
    assert.notEqual(openTag(html, 'id="compare"'), "");
    assert.match(html, /href="\/users\/f1\/compare"/);
  });

  test("every list a friend shares can be copied, past the first page too (CR-16), with a 44px Copy (CR-9)", () => {
    const html = render(
      <FriendProfile
        view={{
          ...base,
          tierLists: {
            rows: Array.from({ length: 20 }, (_, i) => ({
              id: `l${i + 1}`,
              name: `List ${i + 1}`,
              href: `/tier-lists/l${i + 1}`,
              description: "",
            })),
            endCursor: "c20",
            hasNextPage: true,
            totalCount: 25,
          },
        }}
      />,
    );
    assert.equal(
      (html.match(/aria-label="Copy List \d+ to your lists"/g) ?? []).length,
      20,
    );
    const copy = openTag(html, 'aria-label="Copy List 1 to your lists"');
    assert.match(copy, /\bmin-h-11\b/);
    assert.match(copy, /\bmin-w-11\b/);
    assert.ok(textOf(html).includes("20 of 25"));
  });
});
