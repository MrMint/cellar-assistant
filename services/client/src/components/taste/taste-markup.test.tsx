/**
 * /taste-profile as first paint meets it (Social-Recap boards): one h1 on the
 * page (CR-13); the archetype with your styles and what it is built from; the
 * locked card; no friends; agreement rows opening S1's compare.
 * FriendProfile's Compare section is tested in `TasteCompareSection.test.tsx`.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, createRequest, Provider, ssrExchange } from "urql";

mock.module("next/navigation", () => ({
  useRouter: () => ({
    replace: () => {},
    push: () => {},
    refresh: () => {},
    back: () => {},
  }),
  usePathname: () => "/taste-profile",
  useSearchParams: () => new URLSearchParams(),
}));
mock.module("next/image", () => ({
  default: (props: { alt: string }) => (
    <span data-next-image="photo" data-alt={props.alt} />
  ),
}));

const { TasteProfileView } = await import("./TasteProfileView");
const { TasteProfileQuery } = await import("./queries");
const { textOf } = await import("@/test-support/markup");

/** A client that answers the taste-profile query at once with `data`. */
const answering = (data: unknown) =>
  new Client({
    url: "http://test.invalid/graphql",
    exchanges: [
      ssrExchange({
        isClient: true,
        initialState: {
          [createRequest(TasteProfileQuery, {}).key]: {
            data: JSON.stringify(data),
          },
        },
      }),
    ],
  });

const render = (client: Client, node: ReactNode) =>
  renderToStaticMarkup(<Provider value={client}>{node}</Provider>);

const PROFILE = {
  tasteProfile: {
    __typename: "TasteProfile",
    ratingCount: 12,
    line: "You lean toward bright, dry whites.",
    linePhrasedByAi: false,
    types: {
      edges: [{ node: { itemType: "WINE", count: 12 } }],
    },
    archetype: {
      key: "bright-whites",
      title: "The Bright White",
      loves: {
        edges: [
          {
            node: {
              itemType: "WINE",
              label: "RIESLING",
              average: 4.5,
              count: 4,
            },
          },
        ],
      },
    },
    friends: { __typename: "TasteAgreementConnection", edges: [] },
  },
};

describe("TasteProfileView", () => {
  test("the AppBar's title is the one h1; the archetype is an h2", () => {
    const html = render(answering(PROFILE), <TasteProfileView />);
    assert.ok(textOf(html).includes("The Bright White"));
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.match(html, /<h2\b[^>]*>The Bright White<\/h2>/);
  });

  test("your styles in gold with your average; the bars open your top rated by kind", () => {
    const html = render(answering(PROFILE), <TasteProfileView />);
    const text = textOf(html);
    assert.ok(text.includes("Rated highest"));
    assert.ok(text.includes("Riesling"));
    assert.ok(text.includes("4.5"));
    assert.ok(text.includes("12 ratings · 1 kind"));
    assert.match(html, /href="\/rankings\?types=%5B%22WINE%22%5D"/);
    assert.match(html, /href="\/tier-lists"/);
  });

  test("locked: the meter, n of 10, and Find drinks; Add friend is not a second primary", () => {
    const html = render(
      answering({
        tasteProfile: {
          ...PROFILE.tasteProfile,
          ratingCount: 3,
          archetype: null,
        },
      }),
      <TasteProfileView />,
    );
    const text = textOf(html);
    assert.ok(text.includes("Rate 10 drinks to see yours"));
    assert.ok(text.includes("3 of 10"));
    assert.match(html, /href="\/search"[^>]*>Find drinks</);
    assert.ok(text.includes("No friends to compare yet"));
    assert.match(html, /href="\/friends"[^>]*>Add friend</);
    assert.ok(!text.includes("What it’s built from"));
  });

  test("no friends with an archetype: the invite is the primary", () => {
    const text = textOf(render(answering(PROFILE), <TasteProfileView />));
    assert.ok(text.includes("No friends to compare yet"));
    assert.ok(text.includes("Invite a friend"));
  });

  test("agreement: cells and a of n, or only what is shared below the gate; each opens compare", () => {
    const friend = (
      userId: string,
      name: string,
      shared: number,
      agreed: number | null,
    ) => ({
      __typename: "TasteAgreement",
      userId,
      name,
      avatarUrl: null,
      shared,
      agreed,
      byType: { edges: [] },
    });
    const html = render(
      answering({
        tasteProfile: {
          ...PROFILE.tasteProfile,
          friends: {
            __typename: "TasteAgreementConnection",
            edges: [
              { node: friend("u2", "Test Two", 10, 9) },
              { node: friend("u3", "Sam Sample", 2, null) },
            ],
          },
        },
      }),
      <TasteProfileView />,
    );
    const text = textOf(html);
    assert.ok(text.includes("within ½ star"));
    assert.ok(text.includes("9 of 10"));
    assert.ok(text.includes("Not enough in common yet"));
    assert.match(html, /href="\/users\/u2#compare"/);
    assert.match(html, /href="\/users\/u3#compare"/);
    assert.doesNotMatch(text, /%/);
  });

  test("a failed friends read says so, with Try again", () => {
    const text = textOf(
      render(
        answering({
          tasteProfile: {
            ...PROFILE.tasteProfile,
            friends: {
              __typename: "ForbiddenError",
              message: "no",
              code: "FORBIDDEN",
            },
          },
        }),
        <TasteProfileView />,
      ),
    );
    assert.ok(text.includes("Couldn’t load friends"));
    assert.ok(text.includes("Try again"));
  });
});

describe("TasteProfileView header (F-14)", () => {
  test("the bar title is the board's small t-head, not the large t-title", () => {
    const html = render(answering(PROFILE), <TasteProfileView />);
    assert.match(html, /<h1 class="t-head[^"]*"[^>]*>Taste profile<\/h1>/);
    assert.doesNotMatch(html, /<h1 class="t-title/);
  });
});
