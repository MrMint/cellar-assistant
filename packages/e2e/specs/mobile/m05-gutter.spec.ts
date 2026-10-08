import type { Locator, Page } from "@playwright/test";
import { createCellar, deleteCellars, unique } from "../../fixtures/data.ts";
import { bottomNav, expect, test } from "../../fixtures/mobile.ts";
import {
  gutterOffenders,
  horizontalOverflow,
  type Probe,
} from "../../fixtures/mobile-rules.ts";
import { Gql, settleNetwork } from "../../fixtures/test.ts";

/**
 * N20 · a 16 pt gutter and no sideways scroll at 375 (observation 15,
 * cellars-19).
 *
 * At 375x667 — the second viewport the product is judged at
 * (`docs/product/design-direction.md`) — the cellar's search field, its
 * type-count bar and "Add item" touch the screen edges. The design direction's
 * `Page` primitive is "one 16 pt gutter token"; this holds every page it
 * checks to that.
 *
 * Two rules per page:
 *
 * 1. Nothing scrolls sideways: not the document, and no full-width container
 *    hides content past its edge (`overflow-x: hidden` cutting off a button
 *    reads as a gutter bug from the outside, so it is reported as one).
 * 2. Every control and text block in the content area — inputs, buttons,
 *    links, headings, paragraphs, labels — sits at least 16 px from both
 *    edges. The tab bar is exempt (it is edge to edge by design), and so is
 *    anything inside a horizontally scrolling row, whose children are meant
 *    to bleed.
 *
 * The cellar is created empty through the API (the controls render whether or
 * not it holds bottles) and deleted afterwards. No places are created.
 */

test.use({
  viewport: { width: 375, height: 667 },
});

const GUTTER = 16;

let cellarId: string | undefined;

test.beforeAll(async () => {
  const api = await Gql.forAccount("primary");
  try {
    cellarId = await createCellar(api, unique("E2 Mobile Gutter"), "PRIVATE");
  } finally {
    await api.dispose();
  }
});

test.afterAll(async () => {
  if (cellarId !== undefined) await deleteCellars("primary", [cellarId]);
});

type Target = {
  name: string;
  path: () => string;
  /** What has to be on screen before measuring means anything. */
  ready: (page: Page) => Locator;
};

const targets: Target[] = [
  {
    name: "a cellar's items (observation 15)",
    path: () => `/cellars/${cellarId}/items`,
    ready: (page) => page.getByText(/add item/i).first(),
  },
  {
    name: "the cellars index",
    path: () => "/cellars",
    ready: (page) => page.locator(`a[href="/cellars/${cellarId}/items"]`),
  },
  {
    name: "search",
    path: () => "/search",
    ready: (page) =>
      page.getByRole("searchbox").or(page.getByRole("textbox")).first(),
  },
];

/** Measure the page: overflow per container, and every content element's edges. */
function measure(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return (
        r.width >= 2 &&
        r.height >= 2 &&
        style.visibility !== "hidden" &&
        style.display !== "none"
      );
    };
    const scrollsSideways = (el: Element) => {
      const style = getComputedStyle(el);
      return (
        (style.overflowX === "auto" || style.overflowX === "scroll") &&
        el.scrollWidth > el.clientWidth
      );
    };
    const exempt = (el: Element) => {
      for (let a: Element | null = el; a !== null; a = a.parentElement) {
        if (a.hasAttribute("data-e2e-bottom-nav")) return true;
        if (a !== el && scrollsSideways(a)) return true;
      }
      return false;
    };

    const clipped: Array<{
      label: string;
      scrollWidth: number;
      clientWidth: number;
    }> = [
      {
        label: "the document",
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: window.innerWidth,
      },
    ];
    for (const el of document.querySelectorAll("body *")) {
      const style = getComputedStyle(el);
      if (style.overflowX !== "hidden" && style.overflowX !== "clip") continue;
      if (el.getBoundingClientRect().width < vw * 0.9 || exempt(el)) continue;
      const cls = String(el.className).split(/\s+/).slice(0, 2).join(".");
      clipped.push({
        label: `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""} (overflow-x: ${style.overflowX})`,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      });
    }

    const probes: Array<{
      label: string;
      edges: { left: number; right: number; top: number; bottom: number };
    }> = [];
    const selector = [
      'input:not([type="hidden"])',
      "textarea",
      "select",
      "button",
      "a[href]",
      '[role="button"]',
      "h1",
      "h2",
      "h3",
      "h4",
      "p",
      "label",
    ].join(",");
    for (const el of document.querySelectorAll(selector)) {
      if (!shown(el) || exempt(el)) continue;
      // A native input Joy stretches invisibly over its own control has the
      // control's edges; one hidden by opacity alone is not content.
      if (getComputedStyle(el).opacity === "0") continue;
      const r = el.getBoundingClientRect();
      const name =
        el.getAttribute("aria-label") ??
        el.getAttribute("placeholder") ??
        (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
      probes.push({
        label: `${el.tagName.toLowerCase()} "${name}"`,
        edges: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      });
    }
    return { viewportWidth: vw, clipped, probes };
  });
}

for (const target of targets) {
  test(`${target.name}: no sideways scroll and a ${GUTTER}px gutter at 375`, async ({
    page,
  }) => {
    expect(cellarId, "the fixture cellar was not created").toBeDefined();
    await page.goto(target.path());
    await expect(target.ready(page)).toBeVisible();
    await settleNetwork(page);
    await bottomNav(page);

    const { viewportWidth, clipped, probes } = await measure(page);
    expect(viewportWidth).toBe(375);

    const overflowing = clipped
      .map((box) => ({ label: box.label, by: horizontalOverflow(box) }))
      .filter((box) => box.by > 0)
      .map((box) => `${box.label}: ${box.by}px wider than the screen`);
    expect
      .soft(overflowing, "content runs past the right edge of the screen")
      .toEqual([]);

    expect(probes.length, "measured nothing on the page").toBeGreaterThan(0);
    expect(
      gutterOffenders(probes as Probe[], viewportWidth, GUTTER),
      `content inside the ${GUTTER}px gutter`,
    ).toEqual([]);
  });
}
