/**
 * Home "Today" (X10), server-rendered: what each section draws from its data
 * — the inbox rows and where they go, the tray's N07 wording, Continue's
 * Pour, Drink soon's labelled window (D29), the feed's sentences and its
 * empty state, the D14 pre-prompt, and the search sheet's Close.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";
import { stripStyleBlocks, stripTags } from "@/test-support/markup";

mock.module("next/image", () => ({
  default: (props: { alt: string }) => (
    <span data-next-image="art" data-alt={props.alt} />
  ),
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({
    replace: () => {},
    push: () => {},
    refresh: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

let geo = {
  location: null as { latitude: number; longitude: number } | null,
  loading: false,
  error: null as string | null,
  permission: "prompt" as string,
  requested: false,
  dismissed: false,
};
mock.module("@/components/map/hooks/useGeolocation", () => ({
  useGeolocation: () => ({ ...geo, request: () => {}, dismiss: () => {} }),
}));

const { HomeInbox } = await import("./HomeInbox");
const { ContinueSection } = await import("./ContinueShelf");
const { FriendsFeed } = await import("./FriendsFeed");
const { NearbySection, HOME_LOCATION_COPY } = await import("./NearbySection");
const { TodayHeader } = await import("./TodayHeader");
const { NewPersonHero } = await import("./HomeLayout");
const { SearchSheetHeader } = await import("../search/SearchSheetHeader");
const { seenHash } = await import("./seen-cookie");
const { seenKeyOf } = await import("./inbox");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  stripStyleBlocks(
    renderToStaticMarkup(<Provider value={client}>{node}</Provider>),
  );
const text = (html: string) => stripTags(html, " ").replace(/\s+/g, " ");

type Job = Parameters<typeof HomeInbox>[0]["initialJobs"][number];
const job = (overrides: Partial<Job>): Job => ({
  __typename: "AiJob",
  id: "MENU_SCAN:s1",
  kind: "MENU_SCAN",
  status: "RUNNING",
  subjectId: "s1",
  itemType: null,
  placeId: null,
  placeName: null,
  count: null,
  tierListName: null,
  recipeId: null,
  recipeName: null,
  startedAt: "2026-10-09T12:00:00.000Z",
  finishedAt: null,
  failureCode: null,
  failureReason: null,
  retryAt: null,
  ...overrides,
});

describe("TodayHeader", () => {
  test("one h1, and a search field that opens the sheet", () => {
    const html = render(<TodayHeader displayName="Riley Park" />);
    assert.equal(html.match(/<h1\b/g)?.length, 1);
    assert.match(html, /href="\/search"/);
    assert.match(html, /aria-label="Search bottles, places and recipes"/);
    const words = text(html);
    assert.match(words, /Bottles, places, lists/);
    assert.match(words, /Scan/);
    assert.match(words, /Photo/);
  });

  test("a new person: the hero, one way on, and no number anywhere", () => {
    const html = render(
      <>
        <TodayHeader displayName="Riley Park" collectionLine={null} />
        <NewPersonHero />
      </>,
    );
    const words = text(html);
    assert.match(words, /Start with a bottle/);
    assert.match(words, /Snap its label to add it/);
    assert.match(html, /href="\/add\?mode=bottle"/);
    assert.doesNotMatch(words, /\d/, "no count that isn't theirs");
  });
});

describe("HomeInbox", () => {
  const draft = job({
    id: "LABEL_READ:o1",
    kind: "LABEL_READ",
    status: "READY",
    subjectId: "o1",
    itemType: "WINE",
    finishedAt: "2026-10-09T12:05:00.000Z",
  });
  const failed = job({
    id: "MENU_SCAN:s2",
    status: "FAILED",
    subjectId: "s2",
    placeName: "Cork & Barrel",
    failureCode: "BUDGET_EXCEEDED",
    failureReason: "SERVICE_BUDGET",
    finishedAt: "2026-10-09T12:06:00.000Z",
  });

  test("the tray shows running work in words and a failure in N07's", () => {
    const html = render(
      <HomeInbox
        initialJobs={[job({ placeName: "Old Mill" }), failed]}
        suggestions={[]}
        requests={[]}
        initialSeen={[]}
      />,
    );
    const words = text(html);
    assert.match(words, /Reading the menu at Old Mill/);
    assert.match(words, /The menu at Cork &amp; Barrel wasn(&#x27;|')t read/);
    assert.match(words, /AI features are paused for now/);
    assert.match(html, /data-tone="warning"/, "a budget is calm, not red");
  });

  test("Waiting on you: matches, a draft and a request, each deep-linked", () => {
    const html = render(
      <HomeInbox
        initialJobs={[draft]}
        suggestions={[
          {
            id: "m1",
            menuScanId: "s9",
            accepted: null,
            rejected: null,
            menuItemName: "Negroni",
            createdAt: null,
            place: { id: "p1", name: "Cork & Barrel" },
          },
        ]}
        requests={[
          {
            id: "f1",
            status: "PENDING",
            user: { id: "u1", displayName: "Test Two", avatarUrl: null },
          },
        ]}
        initialSeen={[]}
      />,
    );
    const words = text(html);
    assert.match(html, /id="waiting"/);
    assert.match(words, /Waiting on you/);
    assert.match(words, /1 menu match to confirm/);
    assert.match(html, /href="\/map\/scans\/s9"/);
    assert.match(words, /Your wine draft is ready to check/);
    assert.match(html, /href="\/add\?draft=o1&amp;type=WINE"/);
    assert.match(words, /Test Two wants to be friends/);
    assert.match(words, /Accept/);
  });

  test("a result seen in this browser (the cookie) is not drawn at all", () => {
    const html = render(
      <HomeInbox
        initialJobs={[draft]}
        suggestions={[]}
        requests={[]}
        initialSeen={[seenHash(seenKeyOf(draft))]}
      />,
    );
    assert.doesNotMatch(text(html), /draft is ready/);
    assert.doesNotMatch(text(html), /Waiting on you/);
  });
});

describe("ContinueSection", () => {
  const NOW = Date.parse("2026-10-09T12:00:00.000Z");
  const bottle = (id: string, style: string | null, daysOpen: number) => ({
    id,
    cellarId: "c1",
    cellarName: "Home Cellar",
    href: `/cellars/c1/wines/${id}`,
    itemId: `w-${id}`,
    type: "WINE" as const,
    title: `Wine ${id}`,
    name: `Wine ${id}`,
    photoUrl: null,
    placeholder: null,
    plate: { name: `Wine ${id}` },
    openAt: new Date(NOW - daysOpen * 86_400_000 - 60_000).toISOString(),
    emptyAt: null,
    percentageRemaining: 40,
    style,
    form: null,
    styleFields: { style, variety: null, form: null },
    rating: null as number | null,
    maker: null,
  });

  test("Open: tiles past their best first, the rest with their level; no Pour in a tile", () => {
    const html = render(
      <ContinueSection
        bottles={[bottle("fresh", "RED", 0), bottle("old", "RED", 9)]}
        total={20}
        serverNow={NOW}
      />,
    );
    const words = text(html);
    assert.match(words, /Open 20/);
    assert.equal(html.match(/data-slot="open-bottle"/g)?.length, 2);
    assert.ok(
      words.indexOf("Wine old") < words.indexOf("Wine fresh"),
      "the furthest past its best leads",
    );
    assert.match(words, /Past its best/);
    assert.match(words, /Open · 40%/);
    assert.doesNotMatch(words, /Pour/, "Pour lives on the bottle card");
    assert.match(html, /href="\/cellars\/c1\/wines\/old"/);
  });

  test("Rate the n counts the open bottles without the owner's rating, and goes to the first", () => {
    const html = render(
      <ContinueSection
        bottles={[
          { ...bottle("rated", null, 1), rating: 4 },
          bottle("u1", null, 1),
          bottle("u2", null, 1),
        ]}
        serverNow={NOW}
      />,
    );
    assert.match(text(html), /Rate the 2/);
    assert.match(
      html,
      /href="\/cellars\/c1\/wines\/u1"[^>]*>[\s\S]*?Rate the 2/,
    );
    const none = render(
      <ContinueSection
        bottles={[{ ...bottle("rated", null, 1), rating: 4 }]}
        serverNow={NOW}
      />,
    );
    assert.doesNotMatch(text(none), /Rate the/);
  });

  test("Drink soon: sealed rows only, each with a 44 Open, four then Show more", () => {
    const sealedRow = (id: string) => ({
      id,
      cellarId: "c1",
      href: `/cellars/c1/beers/${id}`,
      type: "BEER" as const,
      title: `Hazy ${id}`,
      name: `Hazy ${id}`,
      photoUrl: null,
      past: true,
      line: "Sealed · ended Jan 2026",
      typical: "Typical for IPA",
    });
    const html = render(
      <ContinueSection
        bottles={[bottle("a", "RED", 6)]}
        sealed={["s1", "s2", "s3", "s4", "s5"].map(sealedRow)}
        sealedTotal={9}
        serverNow={NOW}
      />,
    );
    const words = text(html);
    assert.match(words, /Drink soon 9/);
    assert.match(words, /Sealed · ended Jan 2026/);
    assert.match(words, /Typical for IPA/);
    assert.equal(html.match(/data-kind="drink-soon-sealed"/g)?.length, 4);
    assert.match(words, /Show more · 1/);
    const open = html.match(/<button[^>]*aria-label="Open Hazy s1"[^>]*>/)?.[0];
    assert.ok(open !== undefined);
    assert.match(open, /h-11/, "Open is 44 tall (KIT § 2 buttons)");
    // The opened bottle is in the rail, never a Drink soon row.
    assert.doesNotMatch(html, /aria-label="Open Wine a"/);

    // Nothing open: no rail, but the sealed rows still draw.
    const only = render(
      <ContinueSection
        bottles={[]}
        sealed={[sealedRow("s1")]}
        serverNow={NOW}
      />,
    );
    assert.doesNotMatch(
      html.length > 0 ? text(only) : "",
      /Past its best|Rate the/,
    );
    assert.match(text(only), /Drink soon/);
  });

  test("nothing open, nothing drawn", () => {
    assert.equal(render(<ContinueSection bottles={[]} serverNow={NOW} />), "");
  });
});

describe("FriendsFeed", () => {
  test("no friends: one line and Invite (N15)", () => {
    const html = render(
      <FriendsFeed
        initialNodes={[]}
        initialCursor={null}
        initialHasMore={false}
        friendCount={0}
        viewerId="v"
      />,
    );
    assert.match(text(html), /Taste is better compared/);
  });

  test("friends with nothing yet: the section stays out of the way", () => {
    const html = render(
      <FriendsFeed
        initialNodes={[]}
        initialCursor={null}
        initialHasMore={false}
        friendCount={3}
        viewerId="v"
      />,
    );
    assert.equal(html, "");
  });

  test("a friend's Made-it log shows a recipe thumb, not a place (H-13)", () => {
    const node = {
      __typename: "ActivityEntry",
      id: "e1",
      kind: "CHECKED_IN",
      occurredAt: new Date().toISOString(),
      rank: null,
      cellarItemId: null,
      user: {
        __typename: "UserProfile",
        id: "u2",
        displayName: "Sam",
        avatarUrl: null,
      },
      item: null,
      place: null,
      review: null,
      tierListItem: null,
      cellar: null,
      checkIn: {
        __typename: "ItemCheckIn",
        id: "k1",
        score: null,
        note: null,
        tags: [],
        companionIds: [],
        place: null,
        companions: { edges: [] },
        recipe: { __typename: "Recipe", id: "r1", name: "Negroni" },
      },
    } as unknown as Parameters<typeof FriendsFeed>[0]["initialNodes"][number];
    const html = render(
      <FriendsFeed
        initialNodes={[node]}
        initialCursor={null}
        initialHasMore={false}
        friendCount={1}
        viewerId="v"
      />,
    );
    assert.match(text(html), /Sam made Negroni/);
    assert.match(html, /data-thumb="recipe"/);
    assert.doesNotMatch(html, /data-thumb="place"/);
    // F2b's activity card, under the four chips with All on.
    assert.match(html, /data-slot="activity-item"/);
    assert.deepEqual(
      [
        ...html.matchAll(
          /aria-pressed="(true|false)"[^>]*>(?:<[^>]+>)*([A-Za-z]+)</g,
        ),
      ].map((m) => `${m[2]}:${m[1]}`),
      ["All:true", "Rated:false", "Ranked:false", "Added:false"],
    );
  });
});

describe("NearbySection (D14)", () => {
  test("not asked yet: our one line first, then the browser's prompt on a tap", () => {
    geo = { ...geo, permission: "prompt", requested: false, dismissed: false };
    const words = text(render(<NearbySection />));
    assert.match(words, new RegExp(HOME_LOCATION_COPY));
    assert.match(words, /Use my location/);
    assert.match(words, /Not now/);
  });

  test("refused: nothing", () => {
    geo = { ...geo, permission: "denied", error: "denied" };
    assert.equal(render(<NearbySection />), "");
  });
});

describe("SearchSheetHeader", () => {
  test("a title and a named Close", () => {
    const html = render(<SearchSheetHeader />);
    assert.match(html, /<h1\b[^>]*>Search<\/h1>/);
    assert.match(html, /aria-label="Close search"/);
  });
});
