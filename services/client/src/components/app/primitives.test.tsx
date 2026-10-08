/**
 * The app primitives that render on the server (no state, no portal): what
 * they put in the markup — roles, names, the token classes — and the pure
 * rules behind the shell (which tab is lit, how the content area lays out,
 * the in-app history stack).
 *
 * Interactive behaviour (sheets, the tab bar, segments, rating, toasts) is in
 * `interactive.test.tsx`, under happy-dom.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ITEM_TYPE_ORDER } from "@/lib/tokens";
import { ActionBar } from "./ActionBar";
import { AIDraftField, CONFIDENCE_LABEL } from "./AIDraftField";
import { contentLayout } from "./AppShell";
import { EmptyState } from "./EmptyState";
import { FilterChip } from "./FilterChip";
import { IconButton } from "./IconButton";
import * as icons from "./icons";
import { Link } from "./Link";
import { activeTab, CAPTURE_OPTIONS, isUnder, TABS } from "./nav";
import { nextNavStack } from "./nav-history";
import { InsetSection, ListRow, Page } from "./Page";
import { formatScore, Score } from "./Score";
import { ITEM_TYPES_IN_ORDER, itemTypeTokens, TypeChip } from "./TypeChip";
import { UserAvatar } from "./UserAvatar";

const html = (node: ReactNode) => renderToStaticMarkup(node);
const classOf = (markup: string, slot: string) =>
  new RegExp(`data-slot="${slot}"[^>]*class="([^"]*)"`).exec(markup)?.[1] ??
  new RegExp(`class="([^"]*)"[^>]*data-slot="${slot}"`).exec(markup)?.[1] ??
  "";

describe("nav: which tab is lit", () => {
  test("four tabs in bar order; ＋ sits between Cellar and Map", () => {
    assert.deepEqual(
      TABS.map((t) => t.label),
      ["Home", "Cellar", "Map", "Me"],
    );
  });

  test("a tab is lit for its route and everything under it", () => {
    assert.equal(activeTab("/"), "home");
    assert.equal(activeTab("/search"), "home");
    assert.equal(activeTab("/cellars"), "cellar");
    assert.equal(activeTab("/cellars/abc/items"), "cellar");
    assert.equal(activeTab("/recipes/1"), "cellar");
    assert.equal(activeTab("/map"), "map");
    assert.equal(activeTab("/map/scans"), "map");
    assert.equal(activeTab("/places/9"), "map");
    assert.equal(activeTab("/me"), "me");
    assert.equal(activeTab("/tier-lists/3"), "me");
    assert.equal(activeTab("/users/edit"), "me");
  });

  test("a prefix is a path segment, not a string prefix", () => {
    assert.equal(isUnder("/mapx", "/map"), false);
    assert.equal(isUnder("/map", "/map"), true);
    assert.equal(isUnder("/cellars", "/"), false);
    assert.equal(activeTab("/wines/1"), undefined);
  });

  test("every destination is a real route (the /me hub arrives with S1)", () => {
    const app = fileURLToPath(
      new URL("../../app/(authenticated)", import.meta.url),
    );
    const hrefs = [
      ...TABS.map((t) => t.href),
      ...CAPTURE_OPTIONS.map((o) => o.href),
    ];
    const missing = hrefs.filter(
      (href) =>
        href !== "/" &&
        !existsSync(`${app}${href}/page.tsx`) &&
        !existsSync(`${app}${href}/page.ts`),
    );
    assert.deepEqual(
      missing.filter((m) => m !== "/me"),
      [],
    );
  });

  test("the chooser offers Bottle · Menu · Recipe · Place", () => {
    assert.deepEqual(
      CAPTURE_OPTIONS.map((o) => o.label),
      ["Bottle", "Menu", "Recipe", "Place"],
    );
  });
});

describe("AppShell: the content area per route", () => {
  test("padded and scrolling everywhere but the map", () => {
    assert.deepEqual(contentLayout("/cellars"), {
      padded: true,
      scrolls: true,
    });
  });
  test("map routes are edge to edge; only the canvas clips", () => {
    assert.deepEqual(contentLayout("/map"), { padded: false, scrolls: false });
    assert.deepEqual(contentLayout("/map/scans"), {
      padded: false,
      scrolls: true,
    });
    assert.deepEqual(contentLayout("/mapping"), {
      padded: true,
      scrolls: true,
    });
  });
});

describe("nav-history: the in-app back stack", () => {
  test("a new page pushes, the page below pops, a repeat is a no-op", () => {
    let s = nextNavStack([], "/cellars");
    s = nextNavStack(s, "/cellars/1");
    assert.deepEqual(s, ["/cellars", "/cellars/1"]);
    s = nextNavStack(s, "/cellars/1");
    assert.deepEqual(s, ["/cellars", "/cellars/1"]);
    s = nextNavStack(s, "/cellars");
    assert.deepEqual(s, ["/cellars"]);
  });
  test("it is bounded", () => {
    let s: string[] = [];
    for (let i = 0; i < 80; i++) s = nextNavStack(s, `/p/${i}`);
    assert.equal(s.length, 50);
    assert.equal(s.at(-1), "/p/79");
  });
});

describe("Link", () => {
  test("a next/link with hover underline by default", () => {
    const m = html(<Link href="/cellars">Cellars</Link>);
    assert.match(m, /<a [^>]*href="\/cellars"/);
    assert.match(classOf(m, "link"), /hover:underline/);
  });
  test("overlay stretches the target over the positioned ancestor", () => {
    const m = html(
      <Link href="/x" overlay underline="none">
        X
      </Link>,
    );
    const cls = classOf(m, "link");
    assert.match(cls, /after:absolute/);
    assert.match(cls, /after:inset-0/);
    assert.match(cls, /no-underline/);
  });
});

describe("IconButton", () => {
  test("a named 44 px button that does not submit forms", () => {
    const m = html(
      <IconButton aria-label="Share">
        <icons.Share />
      </IconButton>,
    );
    assert.match(m, /<button[^>]*type="button"/);
    assert.match(m, /aria-label="Share"/);
    assert.match(classOf(m, "icon-button"), /\bsize-11\b/);
  });
  test("an icon child is not padded off-centre by buttonVariants", () => {
    const cls = classOf(
      html(
        <IconButton aria-label="Share">
          <icons.Share />
        </IconButton>,
      ),
      "icon-button",
    );
    assert.doesNotMatch(cls, /has-\[(>|&gt;)svg\]:px-4/);
    assert.match(cls, /has-\[(>|&gt;)svg\]:p-0/);
  });
  test("sm keeps a 44 px target around a 36 px visual", () => {
    const cls = classOf(
      html(<IconButton aria-label="x" size="sm" />),
      "icon-button",
    );
    assert.match(cls, /\bsize-9\b/);
    assert.match(cls, /after:size-11/);
    assert.match(cls, /after:-translate-x-1\/2/);
  });
  test("sm drawn smaller by a caller still has a 44 px target", () => {
    const cls = classOf(
      html(<IconButton aria-label="x" size="sm" className="size-7" />),
      "icon-button",
    );
    assert.match(cls, /\bsize-7\b/);
    assert.doesNotMatch(cls, /(^|\s)size-9\b/);
    assert.match(cls, /after:size-11/);
  });
});

describe("Page, InsetSection, ListRow", () => {
  test("Page is a centred 720 px column, 1120 when wide", () => {
    assert.match(classOf(html(<Page />), "page"), /max-w-\[720px\]/);
    assert.match(classOf(html(<Page wide />), "page"), /max-w-\[1120px\]/);
  });
  test("InsetSection: an overline heading over a borderless surface", () => {
    const m = html(
      <InsetSection label="In this cellar">
        <ListRow title="Barolo" description="2016 · 2 bottles" />
      </InsetSection>,
    );
    assert.match(m, /<h2 class="type-overline[^"]*">In this cellar<\/h2>/);
    assert.match(m, /bg-surface-1/);
    assert.doesNotMatch(m, /\bborder\b(?!-)/);
    assert.match(m, /Barolo/);
    assert.match(m, /2016 · 2 bottles/);
    assert.match(classOf(m, "list-row"), /min-h-11/);
  });
});

describe("FilterChip", () => {
  test("a toggle button: aria-pressed carries the state", () => {
    const on = html(
      <FilterChip selected count={3}>
        Open
      </FilterChip>,
    );
    assert.match(on, /aria-pressed="true"/);
    assert.match(on, />3</);
    const off = html(
      <FilterChip selected={false} count={0}>
        Open
      </FilterChip>,
    );
    assert.match(off, /aria-pressed="false"/);
    assert.doesNotMatch(off, />0</, "a zero count is hidden");
  });
  test("selected is ink, never brass (a filter is state, not action)", () => {
    const cls = classOf(
      html(<FilterChip selected>x</FilterChip>),
      "filter-chip",
    );
    assert.doesNotMatch(cls, /primary|brass/);
  });
});

describe("TypeChip / itemTypeTokens", () => {
  test("one type order: wine, beer, spirit, sake, coffee, tea", () => {
    assert.deepEqual(ITEM_TYPES_IN_ORDER, [...ITEM_TYPE_ORDER]);
    assert.deepEqual(
      ITEM_TYPES_IN_ORDER.map((t) => itemTypeTokens[t].label),
      ["Wine", "Beer", "Spirit", "Sake", "Coffee", "Tea"],
    );
  });
  test("glyph + word, in the type's text-safe hue on its tint", () => {
    const m = html(<TypeChip type="SAKE" />);
    assert.match(m, />Sake<\/span>$/);
    const cls = classOf(m, "type-chip");
    assert.match(cls, /text-type-sake-text/);
    assert.match(cls, /bg-type-sake\/15/);
    assert.match(m, /<svg[^>]*aria-hidden="true"/);
  });
});

describe("Score", () => {
  test("one decimal, only when it is not zero", () => {
    assert.equal(formatScore(4), "4");
    assert.equal(formatScore(4.5), "4.5");
    assert.equal(formatScore(4.25), "4.3");
    assert.equal(formatScore(3.96), "4");
    assert.equal(formatScore(7), "5");
  });
  test("named as a sentence; the star is decoration", () => {
    const m = html(<Score value={4.5} count={12} />);
    assert.match(m, /role="img"/);
    assert.match(m, /aria-label="Rated 4.5 out of 5, 12 ratings"/);
    assert.match(m, /4.5/);
    assert.match(m, /<svg[^>]*aria-hidden="true"/);
  });
  test("not rated renders nothing", () => {
    assert.equal(html(<Score value={null} />), "");
    assert.equal(html(<Score value={undefined} variant="hero" />), "");
  });
  test("hero is the Fraunces numeral", () => {
    assert.match(html(<Score value={4} variant="hero" />), /type-numeral-xl/);
  });
});

describe("EmptyState", () => {
  test("one Fraunces line, one Inter line, one action", () => {
    const m = html(
      <EmptyState
        illustration={<icons.Cellar />}
        title="Your cellar is waiting."
        description="Snap a bottle to start."
        action={<button type="button">Snap a bottle</button>}
      />,
    );
    assert.match(m, /type-title-1[^>]*>Your cellar is waiting\./);
    assert.match(m, /Snap a bottle to start\./);
    assert.equal(m.match(/<button/g)?.length, 1);
  });
});

describe("AIDraftField", () => {
  test("drafted: a teal rule and the source's mark", () => {
    const m = html(
      <AIDraftField source="label" drafted confidence="check">
        <input aria-label="Name" />
      </AIDraftField>,
    );
    assert.match(m, /data-ai-draft="label"/);
    assert.match(classOf(m, "ai-draft-field"), /border-ai/);
    assert.match(m, /From label · Check this/);
    assert.equal(CONFIDENCE_LABEL.check, "Check this");
  });
  test("edited: the same wrapper, no mark, no rule", () => {
    const m = html(
      <AIDraftField source="pin" drafted={false}>
        <input aria-label="City" />
      </AIDraftField>,
    );
    assert.match(m, /data-slot="ai-draft-field"/);
    assert.doesNotMatch(m, /data-ai-draft=/);
    assert.doesNotMatch(m, /ai-draft-mark/);
    assert.doesNotMatch(classOf(m, "ai-draft-field"), /border-ai/);
  });
  test("teal is the AI's colour and nothing else's: no brass in the mark", () => {
    for (const source of ["label", "suggested", "pin", "barcode"] as const) {
      const m = html(
        <AIDraftField source={source} drafted>
          <span />
        </AIDraftField>,
      );
      assert.doesNotMatch(m, /primary|brass/, source);
    }
  });
});

describe("ActionBar", () => {
  test("floats on glass, sticky above the tab bar", () => {
    const cls = classOf(
      html(
        <ActionBar>
          <button type="button">Pour</button>
        </ActionBar>,
      ),
      "action-bar",
    );
    assert.match(cls, /surface-glass/);
    assert.match(cls, /sticky/);
    assert.match(cls, /bottom-3/);
  });
});

describe("UserAvatar", () => {
  test("the initial without a photo", () => {
    const m = html(<UserAvatar displayName="test two" size="sm" />);
    assert.match(m, />T</);
    assert.match(classOf(m, "user-avatar"), /size-8/);
  });
  test("the photo, named, when there is one", () => {
    const m = html(
      <UserAvatar avatarUrl="https://example.test/a.png" displayName="Ann" />,
    );
    assert.match(m, /<img[^>]*alt="Ann"/);
  });
});

describe("icons", () => {
  test("every export is a component, drawn at the app stroke", () => {
    const { ICON_STROKE, ...rest } = icons;
    assert.equal(ICON_STROKE, 1.75);
    for (const [name, value] of Object.entries(rest)) {
      assert.ok(
        typeof value === "function" || typeof value === "object",
        `${name} is not a component`,
      );
    }
    assert.ok(Object.keys(rest).length >= 70);
  });
});
