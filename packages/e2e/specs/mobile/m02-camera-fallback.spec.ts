import type { Page } from "@playwright/test";
import {
  type CameraMode,
  cameraCalls,
  expect,
  stubCamera,
  test,
} from "../../fixtures/mobile.ts";

/**
 * N20 · N04 — the camera never dead-ends (observation 25, items-6).
 *
 * Adding a first bottle starts at the camera, and today three ordinary phone
 * situations leave a spinner on screen forever with a shutter that does
 * nothing: a camera that cannot meet `CameraCapture`'s `min: 1080`, a refused
 * permission, and iOS standalone's `getUserMedia` that never settles. N04's
 * fix is `ideal`-only constraints, an error state, a 5 s timeout state, and a
 * Library button beside the shutter.
 *
 * `getUserMedia` is replaced per test (`stubCamera`), so each situation is
 * exact and repeatable; nothing here uploads, so nothing is created.
 *
 * The Library control is found by its accessible name (/library/i, the
 * roadmap's word) and proved by what it does — opening a file chooser — not by
 * how it is built.
 */

async function openLabelCamera(page: Page): Promise<void> {
  await page.goto("/add/wines");
  // The barcode step comes first and has its own scanner; skip past it.
  await page.getByRole("button", { name: "Skip" }).tap();
  await expect(
    page.getByText(/take a picture of the back label/i),
    "the onboarding wizard did not reach the label photo step",
  ).toBeVisible();
}

const library = (page: Page) =>
  page.getByRole("button", { name: /library/i }).first();

async function expectLibraryFallback(page: Page, timeout: number) {
  await expect(
    library(page),
    "no Library button: with no camera the user has no way to add a photo",
  ).toBeVisible({ timeout });
  await expect(
    page.getByRole("progressbar"),
    "the camera spinner is still up next to the fallback",
  ).toHaveCount(0);
  const chooser = page.waitForEvent("filechooser", { timeout: 5_000 });
  await library(page).tap();
  const picked = await chooser;
  expect(picked.isMultiple(), "Library should pick one photo").toBe(false);
}

const modes: Array<{ mode: CameraMode; title: string; within: number }> = [
  {
    mode: "denied",
    title: "a refused camera permission offers the Library instead",
    within: 5_000,
  },
  {
    // N04's timeout is 5 s; the budget allows for it plus a render.
    mode: "hangs",
    title:
      "a camera that never answers falls back to the Library after its timeout",
    within: 10_000,
  },
];

for (const { mode, title, within } of modes) {
  test(title, async ({ page, context, noise }) => {
    await stubCamera(context, mode);
    await openLabelCamera(page);
    await expect
      .poll(() => cameraCalls(page), {
        message: "the label step never asked for the camera",
      })
      .toBeGreaterThan(0);
    await expectLibraryFallback(page, within);
    expect(noise.pageErrors).toEqual([]);
  });
}

test("a 640x480 camera still gives a live viewfinder (observation 25)", async ({
  page,
  context,
  noise,
}) => {
  await stubCamera(context, "vga");
  await openLabelCamera(page);
  await expect
    .poll(() => cameraCalls(page), {
      message: "the label step never asked for the camera",
    })
    .toBeGreaterThan(0);

  const video = page.locator("video").first();
  await expect(
    video,
    "no viewfinder: the camera request was probably over-constrained " +
      "(min/exact sizes a 640x480 camera cannot meet) — N04: ideal-only",
  ).toBeVisible();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), {
      message:
        "the viewfinder never received a frame: a 640x480 camera was refused " +
        "by the size constraints — N04: ideal-only",
      timeout: 10_000,
    })
    .toBeGreaterThanOrEqual(2);
  await expect(page.getByRole("button", { name: "Take photo" })).toBeEnabled();
  await expect(
    page.getByRole("progressbar"),
    "the spinner is still over a working viewfinder",
  ).toHaveCount(0);
  expect(noise.pageErrors).toEqual([]);
});
