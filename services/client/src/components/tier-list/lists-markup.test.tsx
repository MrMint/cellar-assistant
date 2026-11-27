/**
 * Render tests for L2's list screens (Social-Lists board): the index card,
 * the New list / List details form, and the guards that keep a write from
 * being offered to someone who may not make it. Fixtures are demo-seed names.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";
import { TooltipProvider } from "@/components/ui/tooltip";
import { stripStyleBlocks, textOf } from "@/test-support/markup";

mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/tier-lists",
  useSearchParams: () => new URLSearchParams(),
}));

const { ListCard } = await import("./lists/ListCard");
const { TierListForm } = await import("./TierListForm");
const { ListDetailsSheet } = await import("./lists/ListSheets");
const { tierListOptionsFor } = await import("./adapter");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
// `TooltipProvider` stands in for the app's own (`AppClientProviders`).
const render = (node: ReactNode) =>
  stripStyleBlocks(
    renderToStaticMarkup(
      <Provider value={client}>
        <TooltipProvider>{node}</TooltipProvider>
      </Provider>,
    ),
  );

const entry = (id: string, band: number, position: number, url?: string) => ({
  id,
  band,
  position,
  entryType: "BEER",
  item: {
    __typename: "Beer" as const,
    id: `item-${id}`,
    type: "BEER",
    name: id,
    images: {
      edges:
        url === undefined
          ? []
          : [{ node: { id: `img-${id}`, file: { id: `f-${id}`, url } } }],
    },
  },
  place: null,
});

const card = (overrides: Record<string, unknown> = {}) =>
  ({
    __typename: "TierList",
    id: "tl-1",
    name: "Beers, ranked",
    privacy: "FRIENDS",
    listType: "beer",
    itemCount: 4,
    contentUpdatedAt: "2026-09-13T10:00:00.000Z",
    createdById: "me",
    createdBy: { id: "me", displayName: "Test", avatarUrl: null },
    top: {
      edges: [
        { node: entry("a", 5, 0, "https://files.example/a.jpg") },
        { node: entry("b", 5, 1) },
        { node: entry("c", 4, 0) },
        { node: entry("d", 2, 0) },
      ],
    },
    bands: {
      edges: [5, 5, 4, 2].map((band, i) => ({ node: { id: `b${i}`, band } })),
    },
    ...overrides,
  }) as never;

const now = new Date("2026-11-27T12:00:00Z");

describe("ListCard: yours (Social-Lists 01)", () => {
  const html = render(<ListCard list={card()} mine now={now} />);

  test("the whole card links to the list, by name", () => {
    assert.match(html, /href="\/tier-lists\/tl-1"/);
    assert.match(textOf(html), /Beers, ranked/);
  });

  test("privacy, count and date in one line", () => {
    assert.match(textOf(html), /Friends,\s*4 beers · Sep 13/);
  });

  test("the photo strip: four cells, each with its rank chip", () => {
    assert.match(html, /src="https:\/\/files\.example\/a\.jpg"/);
    for (const rank of [1, 2, 3, 4]) {
      assert.match(html, new RegExp(`>#${rank}<`));
    }
  });

  test("the five-band bar: every band, an empty one as a stub", () => {
    const bands = [...html.matchAll(/data-band="(\d)"/g)]
      .map((m) => m[1])
      .filter((_, i, all) => i >= all.length - 5);
    assert.deepEqual(bands, ["5", "4", "3", "2", "1"]);
    assert.doesNotMatch(html, /data-slot="band-strip-rest"/);
  });

  test("a list longer than the read keeps the rest neutral", () => {
    const long = render(
      <ListCard list={card({ itemCount: 113 })} mine now={now} />,
    );
    assert.match(long, /data-slot="band-strip-rest"/);
    assert.match(textOf(long), /113 beers/);
  });
});

describe("ListCard: someone else's (compact)", () => {
  const html = render(
    <ListCard
      list={card({
        id: "tl-2",
        name: "Fridge favorites",
        createdById: "u2",
        createdBy: { id: "u2", displayName: "Test Two", avatarUrl: null },
        itemCount: 6,
      })}
      mine={false}
      now={now}
    />,
  );
  test("owner · count, no photo strip", () => {
    assert.match(textOf(html), /Test Two · 6 beers/);
    assert.doesNotMatch(html, /files\.example/);
    assert.match(html, /href="\/tier-lists\/tl-2"/);
  });
});

describe("TierListForm (Social-Lists 25, 08)", () => {
  test("New list: Kind chips in order, Name, Description, Who can see it", () => {
    const html = render(
      <TierListForm onSubmitted={() => {}} onCancel={() => {}} />,
    );
    const text = textOf(html);
    for (const label of ["Kind", "Name", "Description", "Who can see it"]) {
      assert.match(text, new RegExp(label));
    }
    const kinds = [
      "Places",
      "Beers",
      "Wines",
      "Spirits",
      "Coffees",
      "Teas",
      "Sake",
    ];
    const at = kinds.map((kind) => html.indexOf(`>${kind}<`));
    assert.ok(
      at.every((index, i) => index > (at[i - 1] ?? -1)),
      "kind order",
    );
    for (const option of ["Only me", "Friends", "Everyone"]) {
      assert.match(html, new RegExp(`>${option}<`));
    }
    assert.match(html, /value="My places"/);
    assert.match(html, />Cancel</);
    assert.match(html, />Create list</);
  });

  test("List details: no Kind (set at creation), Save", () => {
    const html = render(
      <TierListForm
        id="tl-1"
        onSubmitted={() => {}}
        defaults={{
          name: "Beers, ranked",
          description: "",
          privacy: "FRIENDS",
          list_type: "beer",
        }}
      />,
    );
    assert.doesNotMatch(html, />Kind</);
    assert.match(html, /value="Beers, ranked"/);
    assert.match(html, />Save</);
  });
});

describe("only a list's maker is offered its writes", () => {
  const tierList = {
    id: "tl-1",
    name: "Beers, ranked",
    description: null,
    privacy: "FRIENDS",
    listType: "beer",
    itemCount: 4,
    createdById: "me",
  };
  const props = { open: true, onOpenChange: () => {}, tierList };

  test("List details (rename, privacy, delete) draws nothing for anyone else", () => {
    // Called as a function: the guard runs before any hook, so a stranger,
    // a signed-out viewer and an unknown viewer get null without a render.
    assert.equal(ListDetailsSheet({ ...props, viewerId: "u2" }), null);
    assert.equal(ListDetailsSheet({ ...props, viewerId: null }), null);
    assert.equal(ListDetailsSheet({ ...props, viewerId: undefined }), null);
    assert.notEqual(ListDetailsSheet({ ...props, viewerId: "me" }), null);
  });

  test("Add to a list never offers a list you do not own", () => {
    const options = tierListOptionsFor(
      [
        {
          id: "mine",
          name: "Beers, ranked",
          listType: "beer",
          createdById: "me",
        },
        {
          id: "theirs",
          name: "Fridge favorites",
          listType: "beer",
          createdById: "u2",
        },
        { id: "wine", name: "Wine shelf", listType: "wine", createdById: "me" },
      ],
      [],
      "me",
      "beer",
    );
    assert.deepEqual(
      options.map((option) => option.id),
      ["mine"],
    );
    assert.deepEqual(
      tierListOptionsFor(
        [{ id: "mine", name: "x", listType: "beer", createdById: "me" }],
        [],
        null,
        "beer",
      ),
      [],
    );
  });
});
