/**
 * /taste-profile as first paint meets it: one h1 on the page (CR-13).
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
      loves: { edges: [] },
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
});
