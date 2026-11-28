import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { authStatePath, dataDir, readSeedFile, VISUAL } from "./env.ts";
import {
  type Discovered,
  resolvePath,
  type Seed,
  stem,
  type VisualRoute,
  visualRoutes,
} from "./routes.ts";

/**
 * The before/after sweep (migration plan §5.3/§5.4): every route in
 * `routes.ts`, at 390x844 (`m390`) and, for the routes flagged `desktop`, at
 * 1440x900 (`d1440`). For each it writes, under `VISUAL_OUT`:
 *
 *   <slice>__<slug>__<vp>.png            the first screen
 *   <slice>__<slug>__<vp>__full.png      the whole scroll (document or the
 *                                        app's inner scroller, stitched)
 *   <slice>__<slug>__<vp>__<state>.png   each sheet/dialog the route opens
 *   data/<slice>__<slug>__<vp>.json      status, axe, layout, console errors
 *
 * and `aggregate.ts` folds the JSON into `summary.json`. Capture only: a route
 * fails when it cannot be captured (including a signed-in route that lands
 * on /sign-in), not for what it shows — unless VISUAL_GATE=1, which fails
 * serious/critical axe violations on the page and on each open state, an open
 * state that no longer opens, and horizontal overflow (run it with
 * VISUAL_SLICES set to the converted slices).
 */

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
/** Volatile regions, masked only for pixel-diff baselines (VISUAL_MASK=1). */
const MASKS = [
  "canvas",
  "time",
  '[data-slot="user-avatar"]',
  '[data-slot="ai-draft-field"]',
  "[data-visual-mask]",
];
/** Full-page captures of an inner scroller stop after this many screens. */
const MAX_SEGMENTS = 8;

const routes = visualRoutes(readSeedFile<Seed>()).filter(
  (r) => VISUAL.slices.length === 0 || VISUAL.slices.includes(r.slice),
);

const discovered = (): Discovered => {
  const path = join(VISUAL.out, ".auth", "found.json");
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as Discovered)
    : {};
};

type AxeSummary = {
  counts: Record<"critical" | "serious" | "moderate" | "minor", number>;
  violations: {
    id: string;
    impact: string;
    help: string;
    nodes: number;
    targets: string[];
  }[];
};

async function runAxe(page: Page, include?: string): Promise<AxeSummary> {
  let builder = new AxeBuilder({ page }).withTags(AXE_TAGS);
  if (include !== undefined) builder = builder.include(include);
  const result = await builder.analyze();
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const violations = result.violations.map((v) => {
    const impact = (v.impact ?? "minor") as keyof typeof counts;
    counts[impact] += v.nodes.length;
    return {
      id: v.id,
      impact,
      help: v.help,
      nodes: v.nodes.length,
      targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
    };
  });
  return { counts, violations };
}

async function settle(page: Page, ms: number) {
  await page
    .waitForLoadState("networkidle", { timeout: 12_000 })
    .catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(ms);
}

/** What the plan checks by DOM at 390 (§5.3): fit, touch targets, headings. */
const probeLayout = (page: Page) =>
  page.evaluate(() => {
    const label = (el: Element) =>
      (
        el.getAttribute("aria-label") ??
        (el as HTMLElement).innerText ??
        el.tagName
      )
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 40) || el.tagName.toLowerCase();
    const targets = [
      ...document.querySelectorAll(
        'button, a[href], [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], input[type="checkbox"], input[type="radio"]',
      ),
    ].filter((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        cs.visibility !== "hidden" &&
        cs.display !== "none"
      );
    });
    const small = (min: number) =>
      targets.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width < min || r.height < min;
      });
    const under44 = small(44);
    return {
      viewportWidth: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflowX: document.documentElement.scrollWidth > innerWidth,
      targets: targets.length,
      under44: under44.length,
      under24: small(24).length,
      under44Samples: under44.slice(0, 12).map((el) => {
        const r = el.getBoundingClientRect();
        return `${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}`;
      }),
      h1: [...document.querySelectorAll("h1")].map((h) =>
        (h.textContent ?? "").trim().slice(0, 60),
      ),
      title: document.title,
      buttons: [
        ...new Set(
          [...document.querySelectorAll('button, [role="button"]')].map(label),
        ),
      ].slice(0, 60),
    };
  });

/** The app's own scroll container when the document itself does not scroll. */
const findScroller = (page: Page) =>
  page.evaluate(() => {
    for (const el of document.querySelectorAll("[data-visual-scroller]")) {
      el.removeAttribute("data-visual-scroller");
    }
    const doc = document.documentElement;
    if (doc.scrollHeight > innerHeight + 20) return { doc: true as const };
    const candidates = [...document.querySelectorAll("*")].filter((el) => {
      const cs = getComputedStyle(el);
      return (
        /(auto|scroll)/.test(cs.overflowY) &&
        el.scrollHeight > el.clientHeight + 20 &&
        el.clientHeight > 200
      );
    });
    candidates.sort(
      (a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth,
    );
    const el = candidates[0];
    if (el === undefined) return null;
    el.setAttribute("data-visual-scroller", "1");
    const r = el.getBoundingClientRect();
    return {
      doc: false as const,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      rect: { x: r.left, y: r.top, width: r.width, height: el.clientHeight },
    };
  });

const scrollTo = (page: Page, top: number) =>
  page.evaluate((y) => {
    const el = document.querySelector("[data-visual-scroller]");
    if (el === null) return 0;
    el.scrollTop = y;
    return el.scrollTop;
  }, top);

/**
 * The whole scroll as one PNG. A document that scrolls is a plain full-page
 * shot; an inner scroller is captured a screen at a time and stitched on a
 * canvas in a blank page (no image library needed): chrome above and below
 * the scroller is taken from the first screen.
 */
async function fullCapture(
  page: Page,
  path: string,
  mask: ReturnType<Page["locator"]>[],
): Promise<"document" | "scroller" | "none"> {
  const sc = await findScroller(page);
  if (sc === null) return "none";
  if (sc.doc) {
    await page.screenshot({ path, fullPage: true, mask, timeout: 60_000 });
    return "document";
  }
  const dpr = await page.evaluate(() => devicePixelRatio);
  const step = Math.max(200, Math.floor(sc.clientHeight * 0.9));
  const maxTop = Math.min(
    sc.scrollHeight - sc.clientHeight,
    step * (MAX_SEGMENTS - 1),
  );
  const first = (await page.screenshot({ mask })).toString("base64");
  const segments: { top: number; png: string }[] = [];
  for (let y = 0; ; y = Math.min(y + step, maxTop)) {
    const top = await scrollTo(page, y);
    await page.waitForTimeout(350);
    const png = await page.screenshot({ clip: sc.rect, mask });
    segments.push({ top, png: png.toString("base64") });
    if (y >= maxTop) break;
  }
  await scrollTo(page, 0);
  const helper = await page.context().newPage();
  try {
    const dataUrl = await helper.evaluate(
      async ({ first, segments, rect, dpr, contentHeight }) => {
        const load = (b64: string) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = `data:image/png;base64,${b64}`;
          });
        const fold = await load(first);
        const top = Math.round(rect.y * dpr);
        const bottom = Math.round((rect.y + rect.height) * dpr);
        const content = Math.round(contentHeight * dpr);
        const canvas = document.createElement("canvas");
        canvas.width = fold.width;
        canvas.height = top + content + (fold.height - bottom);
        const ctx = canvas.getContext("2d");
        if (ctx === null) throw new Error("no 2d context");
        ctx.drawImage(fold, 0, 0, fold.width, top, 0, 0, fold.width, top);
        for (const seg of segments) {
          const img = await load(seg.png);
          ctx.drawImage(
            img,
            Math.round(rect.x * dpr),
            top + Math.round(seg.top * dpr),
          );
        }
        ctx.drawImage(
          fold,
          0,
          bottom,
          fold.width,
          fold.height - bottom,
          0,
          top + content,
          fold.width,
          fold.height - bottom,
        );
        return canvas.toDataURL("image/png");
      },
      {
        first,
        segments,
        rect: sc.rect,
        dpr,
        contentHeight: Math.min(sc.scrollHeight, maxTop + sc.clientHeight),
      },
    );
    writeFileSync(
      path,
      Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"),
    );
  } finally {
    await helper.close();
  }
  return "scroller";
}

const describeActive = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (el === null || el === document.body) return "body";
    const name = el.getAttribute("aria-label") ?? el.textContent ?? "";
    return `${el.tagName.toLowerCase()} ${name.trim().slice(0, 40)}`;
  });

for (const viewer of ["anon", "demo", "friend"] as const) {
  const mine = routes.filter((r) => r.as === viewer);
  if (mine.length === 0) continue;
  test.describe(viewer, () => {
    test.use({
      storageState:
        viewer === "anon"
          ? { cookies: [], origins: [] }
          : authStatePath(viewer),
    });
    test.beforeEach(async ({ context }) => {
      // The iOS user agent would otherwise open the install-the-PWA dialog
      // over every page, and the sweep would capture the dialog.
      await context.addInitScript(() => {
        try {
          localStorage.setItem("pwa-install-dismissed-permanently", "true");
        } catch {}
      });
    });
    for (const route of mine) {
      test(`${route.slice} ${route.slug}`, async ({ page }, info) => {
        await capture(page, route, info.project.name);
      });
    }
  });
}

async function capture(page: Page, route: VisualRoute, viewport: string) {
  test.skip(viewport === "d1440" && route.desktop !== true, "phone only");
  const path = resolvePath(route.path, discovered());
  test.skip(path === null, `no id for ${route.path} on this stack`);
  if (path === null) return;

  const name = stem(route, viewport);
  mkdirSync(dataDir(), { recursive: true });
  const errors: string[] = [];
  page.on("console", (m) => {
    // Vercel's analytics script 404s off Vercel: noise, not the page. Any
    // other failed load (an image, a chunk, an API call) is kept, with its URL.
    if (m.type() !== "error") return;
    const where = m.location().url;
    if (/\/_vercel\//.test(where) || /_vercel/.test(m.text())) return;
    // The document's own status is recorded as `status`; not twice.
    if (where === new URL(path, VISUAL.baseURL).href) return;
    errors.push(
      (/Failed to load resource/.test(m.text())
        ? `${m.text()} ${where}`
        : m.text()
      ).slice(0, 300),
    );
  });
  page.on("pageerror", (e) =>
    errors.push(`pageerror: ${e.message.slice(0, 300)}`),
  );

  const startedAt = Date.now();
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  await settle(page, route.settleMs ?? 1200);
  const loadMs = Date.now() - startedAt;
  // A signed-in route that lands on /sign-in captured the sign-in page, not
  // the route: an expired or missing session, never a result.
  const landed = new URL(page.url()).pathname;
  expect(
    route.as === "anon" || !landed.startsWith("/sign-in"),
    `${path} as ${route.as} landed on ${landed}: the session is gone`,
  ).toBe(true);
  const mask = VISUAL.mask ? MASKS.map((s) => page.locator(s)) : [];

  const fold = `${name}.png`;
  await page.screenshot({ path: join(VISUAL.out, fold), mask });
  const fullFile = `${name}__full.png`;
  const full = await fullCapture(page, join(VISUAL.out, fullFile), mask).catch(
    (e: Error) => {
      errors.push(`full capture: ${e.message.split("\n")[0]}`);
      return "none" as const;
    },
  );
  const layout = await probeLayout(page);
  const axe = await runAxe(page);

  const states: {
    name: string;
    file?: string;
    axe?: AxeSummary;
    focusAfterClose?: string;
    error?: string;
  }[] = [];
  for (const state of route.states ?? []) {
    try {
      await state.open(page);
      const file = `${name}__${state.name}.png`;
      await page.screenshot({ path: join(VISUAL.out, file), mask });
      const stateAxe = await runAxe(
        page,
        '[role="dialog"], [role="alertdialog"], [role="menu"]',
      );
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      states.push({
        name: state.name,
        file,
        axe: stateAxe,
        focusAfterClose: await describeActive(page),
      });
    } catch (e) {
      states.push({
        name: state.name,
        error: (e as Error).message.split("\n")[0],
      });
      await page.keyboard.press("Escape").catch(() => {});
    }
  }

  const record = {
    stem: name,
    slice: route.slice,
    slug: route.slug,
    viewport,
    as: route.as,
    note: route.note,
    path,
    finalPath: new URL(page.url()).pathname + new URL(page.url()).search,
    status: response?.status() ?? null,
    loadMs,
    files: { fold, full: full === "none" ? null : fullFile, fullKind: full },
    layout,
    axe,
    states,
    errors: [...new Set(errors)].slice(0, 20),
    tree: VISUAL.tree,
    baseURL: VISUAL.baseURL,
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(
    join(dataDir(), `${name}.json`),
    JSON.stringify(record, null, 2),
  );

  if (VISUAL.gate) {
    expect(
      layout.scrollWidth,
      `${path} is wider than the viewport`,
    ).toBeLessThanOrEqual(layout.viewportWidth);
    expect(seriousOf(axe), describeSerious(axe)).toBe(0);
    // Every sheet or dialog is held to the same bar as the page (§5.4), and
    // one that no longer opens is a regression, not a skipped row.
    for (const state of states) {
      expect(state.error, `${path}: ${state.name} did not open`).toBe(
        undefined,
      );
      if (state.axe !== undefined) {
        expect(
          seriousOf(state.axe),
          `${path}: ${state.name}: ${describeSerious(state.axe)}`,
        ).toBe(0);
      }
    }
  }
}

const seriousOf = (axe: AxeSummary): number =>
  axe.counts.critical + axe.counts.serious;
const describeSerious = (axe: AxeSummary): string =>
  axe.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id} (${v.nodes})`)
    .join(", ");
