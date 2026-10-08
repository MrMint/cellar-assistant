import {
  type BrowserContext,
  test as base,
  expect,
  type Locator,
  type Page,
} from "@playwright/test";
import { storageStatePath } from "./accounts.ts";
import { demandsMoreThan, type Edges } from "./mobile-rules.ts";
import {
  captureUnhandledRejections,
  type PageNoise,
  suppressDevOverlay,
  watch,
} from "./test.ts";

/**
 * N20 · the mobile guardrail's fixtures.
 *
 * The desktop specs build their contexts by hand (`contextFor` in `test.ts`),
 * and `browser.newContext()` does **not** inherit a project's `use` block — so
 * the `mobile` project's 390x844 touch device would be silently replaced by
 * `newContext`'s 1440x900 default. These fixtures use Playwright's own
 * `context`/`page` instead, which do carry the project's device, and add the
 * same two init scripts `newContext` installs. The `page` fixture refuses to
 * run at a desktop width, so a mobile spec run under the `chromium` project
 * fails loudly instead of passing at the wrong size.
 *
 * Every spec here is signed in as `test@test.com`.
 */

/** Wider than any phone; narrower than the `sm` breakpoint's tablets. */
const MAX_PHONE_WIDTH = 430;

export const test = base.extend<{ noise: PageNoise }>({
  storageState: async ({}, use) => {
    await use(storageStatePath("primary"));
  },
  context: async ({ context }, use) => {
    await suppressDevOverlay(context);
    await captureUnhandledRejections(context);
    await use(context);
  },
  page: async ({ page }, use) => {
    const width = page.viewportSize()?.width ?? Number.POSITIVE_INFINITY;
    if (width > MAX_PHONE_WIDTH) {
      throw new Error(
        `a mobile spec is running at ${width}px wide — run it under the ` +
          "`mobile` project (`--project=mobile`), not the desktop one",
      );
    }
    await use(page);
  },
  noise: async ({ page }, use) => {
    await use(watch(page));
  },
});

export { expect };

/** Read an element's edges. */
export async function edgesOf(locator: Locator): Promise<Edges> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  });
}

/**
 * The tab bar pinned to the bottom of the screen.
 *
 * A `navigation` landmark spanning the bottom edge wins. The shell has none
 * today (X21 adds landmarks), so the fallback is the nearest full-width
 * ancestor of the visible link to `/map` near the bottom edge — `/map` being a
 * tab both in today's bar and in D1's Home · Cellar · ＋ · Map · Me. The
 * element found is tagged `data-e2e-bottom-nav` (an attribute nothing in the
 * app reads) so it can be addressed as a locator.
 */
export async function bottomNav(page: Page): Promise<Locator> {
  await expect(
    page
      .locator('nav, [role="navigation"], a[href="/map"]')
      .filter({ visible: true })
      .first(),
    "no navigation is visible at all",
  ).toBeVisible();
  const how = await page.evaluate(() => {
    for (const el of document.querySelectorAll("[data-e2e-bottom-nav]")) {
      el.removeAttribute("data-e2e-bottom-nav");
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        getComputedStyle(el).visibility !== "hidden"
      );
    };
    const atBottom = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.bottom >= vh - 4 && r.top >= vh / 2;
    };
    const landmark = [
      ...document.querySelectorAll('nav, [role="navigation"]'),
    ].find(
      (el) =>
        shown(el) &&
        atBottom(el) &&
        el.getBoundingClientRect().width >= vw * 0.9,
    );
    if (landmark !== undefined) {
      landmark.setAttribute("data-e2e-bottom-nav", "");
      return "landmark";
    }
    const mapLink = [...document.querySelectorAll('a[href="/map"]')].find(
      (a) => shown(a) && a.getBoundingClientRect().top >= vh - 160,
    );
    let el: Element | null = mapLink?.parentElement ?? null;
    while (el !== null && el.getBoundingClientRect().width < vw * 0.9) {
      el = el.parentElement;
    }
    if (el === null) return null;
    el.setAttribute("data-e2e-bottom-nav", "");
    return "fallback";
  });
  expect(
    how,
    "no tab bar at the bottom of the screen: neither a full-width navigation " +
      "landmark on the bottom edge nor a /map tab near it",
  ).not.toBeNull();
  return page.locator("[data-e2e-bottom-nav]");
}

export type CameraMode =
  /** The user (or iOS standalone) refused camera access. */
  | "denied"
  /** `getUserMedia` never settles — the iOS standalone permission quirk. */
  | "hangs"
  /** A working camera that can only deliver 640x480 (observation 25). */
  | "vga";

/**
 * Replace `navigator.mediaDevices.getUserMedia` before any page script runs.
 *
 * Deterministic where Chromium's fake device is not: the fake camera
 * satisfies any size, so it can never reproduce observation 25, and a denied
 * permission cannot be granted per test. `vga` answers like a real 640x480
 * camera — an `OverconstrainedError` naming the constraint when a `min` or
 * `exact` asks for more (judged by `demandsMoreThan`, injected by source), a
 * live 640x480 canvas stream otherwise.
 *
 * Every call is recorded on `window.__e2eCameraCalls`, so a spec can prove the
 * page actually asked for the camera rather than passing by never trying.
 */
export async function stubCamera(
  context: BrowserContext,
  mode: CameraMode,
): Promise<void> {
  await context.addInitScript({
    content: `(${installCameraStub.toString()})(${JSON.stringify(mode)}, ${demandsMoreThan.toString()});`,
  });
}

/** How many times the page has called `getUserMedia` since it loaded. */
export function cameraCalls(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as { __e2eCameraCalls?: unknown[] }).__e2eCameraCalls
        ?.length ?? 0,
  );
}

// Runs in the page, from source: no closures, no imports.
function installCameraStub(
  mode: CameraMode,
  demands: typeof demandsMoreThan,
): void {
  const media = navigator.mediaDevices;
  if (media === undefined) return;
  const calls: unknown[] = [];
  (window as unknown as { __e2eCameraCalls: unknown[] }).__e2eCameraCalls =
    calls;
  const camera = { width: 640, height: 480 };

  const liveStream = (): MediaStream => {
    const canvas = document.createElement("canvas");
    canvas.width = camera.width;
    canvas.height = camera.height;
    const ctx = canvas.getContext("2d");
    let frame = 0;
    const paint = () => {
      if (ctx === null) return;
      frame += 1;
      ctx.fillStyle = `hsl(${(frame * 7) % 360} 50% 40%)`;
      ctx.fillRect(0, 0, camera.width, camera.height);
    };
    paint();
    // A captured canvas only yields frames while it is being painted.
    window.setInterval(paint, 50);
    return canvas.captureStream(20);
  };

  media.getUserMedia = (constraints?: MediaStreamConstraints) => {
    calls.push(constraints ?? null);
    if (mode === "denied") {
      return Promise.reject(
        new DOMException("Permission denied", "NotAllowedError"),
      );
    }
    if (mode === "hangs") return new Promise<MediaStream>(() => {});
    const violated = demands(constraints?.video, camera);
    if (violated !== null) {
      let error: Error;
      try {
        error = new OverconstrainedError(violated, "this camera is 640x480");
      } catch {
        error = Object.assign(
          new DOMException("this camera is 640x480", "OverconstrainedError"),
          { constraint: violated },
        );
      }
      return Promise.reject(error);
    }
    return Promise.resolve(liveStream());
  };
}
