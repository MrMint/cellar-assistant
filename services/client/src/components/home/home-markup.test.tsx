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
const { SearchSheetHeader } = await import("../search/SearchSheetHeader");
const { seenHash } = await import("./seen-cookie");
const { seenKeyOf } = await import("./inbox");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  renderToStaticMarkup(<Provider value={client}>{node}</Provider>).replace(
    /<style[^>]*>[^<]*<\/style>/g,
    "",
  );
const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

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
  });

  test("open bottles with Pour, and Drink soon labelled by its style", () => {
    const html = render(
      <ContinueSection
        bottles={[bottle("a", "RED", 6), bottle("b", null, 30)]}
        serverNow={NOW}
      />,
    );
    const words = text(html);
    assert.match(words, /Continue/);
    assert.match(words, /2 open/);
    assert.equal(html.match(/aria-label="Pour Wine a"/g)?.length, 2);
    assert.match(words, /Drink soon/);
    assert.match(words, /Typical for red wine once open: 3–5 days/);
    // No style, no window (D29): b is open but never under Drink soon.
    assert.equal(html.match(/aria-label="Pour Wine b"/g)?.length, 1);
  });

  test("the shelf holds a dozen; Drink soon ranks the longest open past it", () => {
    // Newest opened first, as `me.openBottles` reads: the overdue red is the
    // fourteenth, past the shelf's dozen — exactly the one Drink soon is for.
    const recent = Array.from({ length: 13 }, (_, index) =>
      bottle(`n${index}`, null, 0),
    );
    const html = render(
      <ContinueSection
        bottles={[...recent, bottle("old", "RED", 9)]}
        total={20}
        serverNow={NOW}
      />,
    );
    assert.equal(html.match(/data-slot="open-bottle"/g)?.length, 12);
    assert.match(text(html), /20 open/);
    assert.match(text(html), /Drink soon/);
    assert.equal(html.match(/aria-label="Pour Wine old"/g)?.length, 1);
    assert.match(text(html), /Open 9 days · Typical for red wine/);
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
    assert.match(text(html), /Taste is better compared\./);
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
