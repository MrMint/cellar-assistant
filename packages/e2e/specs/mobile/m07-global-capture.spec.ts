import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { createCellar, unique } from "../../fixtures/data.ts";
import {
  deleteCellarWithContents,
  deletePlace,
  insertPlace,
} from "../../fixtures/db.ts";
import { expect, stubCamera, test } from "../../fixtures/mobile.ts";
import { Gql } from "../../fixtures/test.ts";

/**
 * X06 · the global capture surface behind ＋, at 390x844 on touch.
 *
 * 1. ＋ opens the camera itself — no chooser sheet — with the tab bar out of
 *    the way, the mode row Bottle · Menu · Recipe, the last mode remembered,
 *    and Close back to where ＋ was tapped.
 * 2. A menu is scanned from anywhere: the position finds the nearest place
 *    the app knows and asks "At …?"; one tap settles it, and the photo is
 *    sent filed there (`placeHint`: that place and where the person stood).
 * 3. A cellar's per-type add route names the cellar on the success sheet
 *    (it used to say "your cellar"), and "Open it now" shows the bottle's
 *    page without opening it.
 *
 * Data: one place inserted directly (no `createPlace` quota) at a point far
 * from every other place, one cellar; both removed afterwards. The menu scan
 * itself is answered by a route stub after the real upload, so no scan row,
 * no menu lines and no model call are left behind — what is asserted is the
 * hint the page sent. The uploaded photo is deleted through the API.
 */

test.describe.configure({ mode: "serial" });

/** A 1×1 PNG that decodes (see `09-menu-scan.spec.ts` for why that matters). */
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNoaGj4DwAFhAKAU5N0NgAAAABJRU5ErkJggg==",
  "base64",
);

// Somewhere in Lake Superior's shore country: no seed or spec place nearby.
const POINT = {
  latitude: 47.31 + Math.random() * 0.05,
  longitude: -88.42 + Math.random() * 0.05,
};
const placeId = randomUUID();
const placeName = unique("E2 Capture Bar").replace(/[^A-Za-z0-9 ]/g, "");
let cellarId = "";
let cellarName = "";

/** The tab bar's brass ＋ ("Add cellar" and friends are links too). */
const plus = (page: Page) =>
  page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Add", exact: true });

test.beforeAll(async () => {
  insertPlace({
    id: placeId,
    name: placeName,
    lat: POINT.latitude + 0.0002, // about 20 m away
    lng: POINT.longitude,
    category: "bar",
  });
  const api = await Gql.forAccount("primary");
  try {
    cellarName = unique("E2 Capture Cellar");
    cellarId = await createCellar(api, cellarName, "PRIVATE");
  } finally {
    await api.dispose();
  }
});

test.afterAll(async () => {
  await deletePlace(placeId);
  if (cellarId !== "") deleteCellarWithContents(cellarId);
});

test("＋ opens the camera, not a chooser; the mode row remembers; Close goes back", async ({
  page,
  context,
  noise,
}) => {
  test.setTimeout(90_000);
  await stubCamera(context, "denied");
  await page.goto("/cellars");
  await plus(page).tap();
  await page.waitForURL(/\/add$/);

  // The camera surface itself: no sheet over the page, no tab bar under it.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
  const modes = page.getByRole("radiogroup", {
    name: "What are you capturing?",
  });
  await expect(modes.getByRole("radio")).toHaveText([
    "Bottle",
    "Menu",
    "Recipe",
  ]);
  await expect(
    page.getByRole("button", { name: /library/i }).first(),
  ).toBeVisible({ timeout: 10_000 });

  await modes.getByRole("radio", { name: "Recipe" }).tap();
  await expect(
    page.getByRole("heading", { name: "Snap a recipe" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Close" }).tap();
  await page.waitForURL(/\/cellars$/);
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();

  // Back through ＋: the last mode used.
  await plus(page).tap();
  await page.waitForURL(/\/add$/);
  await expect(
    page
      .getByRole("radiogroup", { name: "What are you capturing?" })
      .getByRole("radio", { name: "Recipe" }),
  ).toHaveAttribute("aria-checked", "true");
  expect(noise.pageErrors).toEqual([]);
});

test("a menu from anywhere: 'At …?' and one tap files the scan there", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await stubCamera(context, "denied");
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(POINT);

  const fakeScanId = randomUUID();
  let sent: {
    originalImageId?: string;
    placeHint?: Record<string, unknown>;
  } | null = null;
  await page.route("**/api/graphql**", async (route) => {
    const body = route.request().postData() ?? "";
    if (!body.includes("MapCreateMenuScan")) return route.fallback();
    sent = JSON.parse(body).variables?.input ?? null;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          createMenuScan: {
            __typename: "MenuScan",
            id: fakeScanId,
            processingStatus: "pending",
            matchStatus: "waiting",
            processingError: null,
            itemsDetected: 0,
            itemsMatched: 0,
            confidenceScore: null,
            placeId,
          },
        },
      }),
    });
  });

  await page.goto("/add?mode=menu");
  await expect(
    page.getByRole("heading", { name: "Scan a menu" }),
  ).toBeVisible();
  const card = page.locator('[data-slot="menu-place"]');
  await expect(card).toContainText(`At ${placeName}?`, { timeout: 30_000 });
  await card.getByRole("button", { name: /^Yes, I.m here$/ }).tap();
  await expect(card).toContainText(`At ${placeName}`);
  await expect(card.getByRole("button", { name: "Change" })).toBeVisible();

  // The camera is refused, so the library is the way in (N04).
  await page
    .locator('[data-slot="capture-camera"] input[type="file"]')
    .setInputFiles({
      name: "menu.png",
      mimeType: "image/png",
      buffer: PIXEL_PNG,
    });

  await page.waitForURL(new RegExp(`/map/scans/${fakeScanId}$`), {
    timeout: 60_000,
  });
  expect(sent, "createMenuScan was sent").not.toBeNull();
  const input = sent as unknown as {
    originalImageId: string;
    placeHint: { placeId: string; latitude: number; longitude: number };
  };
  expect(input.placeHint.placeId).toBe(placeId);
  expect(input.placeHint.latitude).toBeCloseTo(POINT.latitude, 4);
  expect(input.placeHint.longitude).toBeCloseTo(POINT.longitude, 4);

  // The photo did go up for real; take it back out.
  const api = await Gql.forAccount("primary");
  try {
    await api.query(
      `mutation D($id: ID!) { deleteFile(fileId: $id) { __typename } }`,
      { id: input.originalImageId },
    );
  } finally {
    await api.dispose();
  }
});

test("a per-type cellar add names the cellar; Open it now shows the bottle, unopened", async ({
  page,
  context,
  noise,
}) => {
  test.setTimeout(150_000);
  await stubCamera(context, "denied");
  await page.goto(`/cellars/${cellarId}/teas/add`);
  await expect(page.getByRole("heading", { name: "Add Tea" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();

  await page.getByRole("button", { name: "Type it in instead" }).tap();
  await expect(page.locator('[data-slot="draft-card"]')).toBeVisible({
    timeout: 45_000,
  });
  const name = unique("E2 Capture Tea Draft");
  await page.getByLabel("Name").fill(name);
  await page.getByRole("combobox", { name: /Category/ }).tap();
  await page.getByRole("option").first().tap();
  await page
    .getByRole("main")
    .getByRole("button", { name: "Add", exact: true })
    .tap();

  const sheet = page.getByRole("dialog", { name: "+1 bottle" });
  await expect(sheet).toBeVisible({ timeout: 60_000 });
  await expect(sheet).toContainText(`${name} is in ${cellarName}.`);
  await expect(sheet.getByRole("button", { name: "View bottle" })).toHaveCount(
    0,
  );
  await sheet.getByRole("button", { name: "Open it now" }).tap();
  await page.waitForURL(new RegExp(`/cellars/${cellarId}/teas/[0-9a-f-]+$`), {
    timeout: 30_000,
  });
  const bottleId = new URL(page.url()).pathname.split("/").at(-1) ?? "";

  const api = await Gql.forAccount("primary");
  try {
    const data = await api.query(
      `query C($id: ID!) { cellar(id: $id) {
         __typename
         ... on Cellar { items(first: 50) { edges { node { id openAt } } } }
       } }`,
      { id: cellarId },
    );
    const bottle = data.cellar.items.edges.find(
      (edge: { node: { id: string } }) => edge.node.id === bottleId,
    );
    expect(bottle, "the bottle the page shows is in the cellar").toBeTruthy();
    expect(bottle.node.openAt, "Open it now uncorked the bottle").toBeNull();
  } finally {
    await api.dispose();
  }
  expect(noise.pageErrors).toEqual([]);
});
