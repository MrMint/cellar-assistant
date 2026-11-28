import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../../fixtures/mobile.ts";

/**
 * B04 · BottomSheet physics, with a real finger (CDP touch events, so the
 * browser scrolls and vaul drags exactly as on a phone).
 *
 * 1. A sheet follows a downward drag and closes when let go far enough.
 * 2. Content that can scroll takes the drag: a list inside a sheet scrolls up
 *    and back down without the sheet moving or closing. Only at scrollTop 0
 *    does a downward drag belong to the sheet.
 *
 * The sheets are Map options and a cellar's Arrange (see `settleSheet`);
 * nothing is created. The second test shortens the viewport to 390×320 so the
 * Arrange sheet overflows and its body scrolls.
 */

type Point = { x: number; y: number };

/** One finger from `from` to `to` in `steps` moves, then lifted. */
async function touchDrag(
  page: Page,
  from: Point,
  to: Point,
  { steps = 12, holdMs = 0 }: { steps?: number; holdMs?: number } = {},
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const at = (p: Point) => [{ x: p.x, y: p.y, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: at(from),
  });
  for (let i = 1; i <= steps; i += 1) {
    const p = {
      x: from.x + ((to.x - from.x) * i) / steps,
      y: from.y + ((to.y - from.y) * i) / steps,
    };
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: at(p),
    });
    await page.waitForTimeout(16);
  }
  if (holdMs > 0) await page.waitForTimeout(holdMs);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
}

/**
 * The map's old Filters sheet is gone (the chips are inline now, Map board
 * 15), so the two sheets this spec drags are the ones a phone really opens:
 * Map options (short, no data) and the cellar list's Arrange sheet (long
 * enough to scroll in a short viewport).
 */
async function settleSheet(page: Page, name: string): Promise<Locator> {
  const sheet = page.getByRole("dialog", { name });
  await expect(sheet).toBeVisible();
  await expect(sheet, "the sheet should be vaul's BottomSheet").toHaveAttribute(
    "data-slot",
    "bottom-sheet",
  );
  // vaul ignores drags for its first 500 ms (the open transition).
  await page.waitForTimeout(700);
  return sheet;
}

async function openMapOptions(page: Page): Promise<Locator> {
  await page.goto("/map");
  const options = page.getByRole("button", { name: "Map options" });
  await expect(options, "the map's search row never rendered").toBeVisible({
    timeout: 30_000,
  });
  // The location prompt can sit over the map; set it aside.
  const later = page.getByRole("button", { name: "Not now" });
  if (await later.isVisible()) await later.click();
  await options.click();
  return settleSheet(page, "Map");
}

async function openArrange(page: Page): Promise<Locator> {
  await page.goto("/cellars");
  const cellar = page
    .locator('main a[href^="/cellars/"]:not([href="/cellars/add"])')
    .filter({ visible: true });
  await expect(cellar.first(), "the seeded account has a cellar").toBeVisible({
    timeout: 30_000,
  });
  await cellar.first().click();
  const arrange = page.getByRole("button", { name: /^Arrange: / });
  await expect(arrange, "the cellar list never rendered").toBeVisible({
    timeout: 30_000,
  });
  await arrange.click();
  return settleSheet(page, "Arrange");
}

const centreOf = async (locator: Locator): Promise<Point> => {
  const box = await locator.boundingBox();
  expect(box, "no box to drag from").not.toBeNull();
  return {
    x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
    y: (box?.y ?? 0) + (box?.height ?? 0) / 2,
  };
};

test("a sheet dragged down far enough closes", async ({ page, noise }) => {
  const sheet = await openMapOptions(page);
  const title = sheet.getByRole("heading", { name: "Map" });
  const start = await centreOf(title);
  const viewport = page.viewportSize()?.height ?? 844;

  await touchDrag(page, start, { x: start.x, y: viewport - 8 }, { steps: 16 });

  await expect(
    sheet,
    "the sheet should close on a long drag down",
  ).toBeHidden();
  expect(noise.pageErrors).toEqual([]);
});

test("a list inside a sheet scrolls without dismissing it", async ({
  page,
  noise,
}) => {
  // 320 tall: the sheet caps at 90dvh (288 px), shorter than Arrange's Show,
  // Group and Sort lists, so the body scrolls.
  await page.setViewportSize({ width: 390, height: 320 });
  const sheet = await openArrange(page);
  const body = sheet.locator(".overflow-y-auto").first();
  const metrics = await body.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(
    metrics.scrollHeight,
    "at 390×320 the filters should overflow the sheet, so its body scrolls",
  ).toBeGreaterThan(metrics.clientHeight);

  const sheetTop = async () => (await sheet.boundingBox())?.y ?? 0;
  const restingTop = await sheetTop();
  const centre = await centreOf(body);

  // Finger up: the list scrolls, the sheet stays where it is.
  await touchDrag(
    page,
    { x: centre.x, y: centre.y + 60 },
    { x: centre.x, y: centre.y - 60 },
  );
  await page.waitForTimeout(300);
  const scrolled = await body.evaluate((el) => el.scrollTop);
  expect(scrolled, "the drag should have scrolled the list").toBeGreaterThan(0);
  await expect(sheet).toBeVisible();
  expect(Math.abs((await sheetTop()) - restingTop)).toBeLessThan(4);

  // Finger down while scrolled: the list scrolls back; the sheet stays open.
  await touchDrag(
    page,
    { x: centre.x, y: centre.y - 30 },
    { x: centre.x, y: centre.y + 30 },
    { steps: 8 },
  );
  await page.waitForTimeout(700);
  await expect(
    sheet,
    "a downward drag on a scrolled list is the list's, not a dismiss",
  ).toBeVisible();
  expect(await body.evaluate((el) => el.scrollTop)).toBeLessThan(scrolled);
  expect(noise.pageErrors).toEqual([]);
});
