import { unique } from "../../fixtures/data.ts";
import {
  deletePlace,
  deleteScannedMenu,
  insertPlace,
  insertScannedMenu,
} from "../../fixtures/db.ts";
import { expect, stubCamera, test } from "../../fixtures/mobile.ts";
import { Gql } from "../../fixtures/test.ts";

/**
 * L10 · Seen at, and a menu scanned where no place exists, at 390×844.
 *
 * - An item page lists the places its item was seen on a menu, nearest first
 *   when the browser already shares a position, and links to each.
 * - The capture flow with no saved place within 50 m offers **Add this
 *   place**: a sheet that creates the place only on its confirm, Under
 *   review, and the scan that follows is filed on it.
 *
 * The menu is seeded (`insertScannedMenu`), not read by a model. The capture
 * half stubs `createPlace`, the Google nearby read and `createMenuScan` at
 * the network, so it spends no place quota, no Google budget and no menu
 * budget; the one real upload is deleted at the end.
 */
test.describe.configure({ mode: "serial" });

/** A 1×1 PNG that decodes (see `09-menu-scan.spec.ts`). */
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNoaGj4DwAFhAKAU5N0NgAAAABJRU5ErkJggg==",
  "base64",
);

// Madison, WI, for the seeded place; the capture half stands far from it.
const SEEN = { latitude: 43.0747, longitude: -89.3842 };
// Lake Superior's shore country: no seed or spec place nearby.
const NOWHERE = {
  latitude: 47.36 + Math.random() * 0.05,
  longitude: -88.32 + Math.random() * 0.05,
};

let api: Gql;
let teaId = "";
const teaName = unique("E2 Seen Tea").replace(/[^A-Za-z0-9 ]/g, " ");
const placeId = crypto.randomUUID();
const placeName = unique("E2 Seen Bar").replace(/[^A-Za-z0-9 ]/g, " ");
const scanId = crypto.randomUUID();
const fileId = crypto.randomUUID();
let seeded = false;

test.beforeAll(async () => {
  api = await Gql.forAccount("primary");
  const me = await api.query(`query { me { id } }`);
  const userId: string = me.me.id;

  const ref = await api.query(
    `query { referenceData(kind: TEA_CATEGORY, first: 1) {
       __typename ... on ReferenceRowConnection { edges { node { value } } }
     } }`,
  );
  const category = ref.referenceData.edges[0]?.node.value;
  expect(category, "no tea categories seeded").toBeTruthy();
  const created = await api.query(
    `mutation C($input: CreateItemInput!, $id: ID) {
       createItem(type: TEA, itemId: $id, input: $input) {
         __typename
         ... on MutationCreateItemSuccess { data { id } }
         ... on Error { message }
       }
     }`,
    { id: crypto.randomUUID(), input: { name: teaName, tea: { category } } },
  );
  expect(
    created.createItem.__typename,
    JSON.stringify(created.createItem),
  ).toBe("MutationCreateItemSuccess");
  teaId = created.createItem.data.id;

  insertPlace({
    id: placeId,
    name: placeName,
    lng: SEEN.longitude,
    lat: SEEN.latitude,
    category: "wine_bar",
  });
  insertScannedMenu({
    scanId,
    fileId,
    placeId,
    userId,
    lines: [
      {
        id: crypto.randomUUID(),
        name: teaName.toUpperCase(),
        price: 6,
        type: "tea",
        match: { type: "tea", id: teaId },
      },
    ],
  });
  seeded = true;
});

test.afterAll(async () => {
  if (seeded) {
    deleteScannedMenu(scanId, fileId);
    await deletePlace(placeId);
  }
  await api.dispose();
});

test("an item page lists where it was seen on a menu, nearest first", async ({
  page,
  context,
  noise,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: SEEN.latitude + 0.001,
    longitude: SEEN.longitude,
  });
  await page.goto(`/teas/${teaId}`);
  const seenAt = page.locator('[data-slot="seen-at"]');
  await expect(seenAt.getByRole("heading", { name: "Seen at" })).toBeVisible({
    timeout: 30_000,
  });
  const row = seenAt.getByRole("link", { name: new RegExp(placeName) });
  await expect(row).toBeVisible();
  await expect(row).toContainText(/On the menu · scanned/);
  // About 110 m from where the browser says it is.
  await expect(row).toContainText(/\b1\d\d m\b/);
  await expect(seenAt).toContainText("Nearest first.");
  await expect(
    seenAt.getByRole("link", { name: "Scan a menu" }),
  ).toHaveAttribute("href", "/add?mode=menu");

  const viewport = page.viewportSize();
  const box = await row.boundingBox();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
    viewport?.width ?? 390,
  );

  await row.tap();
  await page.waitForURL(new RegExp(`/places/${placeId}$`));
  expect(noise.pageErrors).toEqual([]);
});

test("capture with no place nearby: add the place, then the scan is filed on it", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await stubCamera(context, "denied");
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(NOWHERE);

  const newName = unique("E2 New Bar").replace(/[^A-Za-z0-9 ]/g, " ");
  const fakeScanId = crypto.randomUUID();
  let createInput: {
    name?: string;
    categories?: string[];
    placeId?: string;
    location?: { lat: number; lng: number };
  } | null = null;
  let creates = 0;
  let scanInput: {
    originalImageId?: string;
    placeHint?: { placeId?: string };
  } | null = null;

  await page.route("**/api/graphql**", async (route) => {
    const body = route.request().postData() ?? "";
    if (body.includes("MapGooglePlaceSuggestions")) {
      // D16 said no: the sheet must stay calm and invent nothing.
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            googlePlaceSuggestions: {
              charged: false,
              reason: "monthly budget reached",
              suggestions: { edges: [] },
            },
          },
        }),
      });
    }
    if (body.includes("MapCreatePlace")) {
      creates += 1;
      createInput = JSON.parse(body).variables?.input ?? null;
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            createPlace: {
              __typename: "CreatePlacePayload",
              place: {
                id: createInput?.placeId ?? crypto.randomUUID(),
                reviewStatus: "PENDING",
              },
              nearbyDuplicates: { edges: [] },
            },
          },
        }),
      });
    }
    if (body.includes("MapCreateMenuScan")) {
      scanInput = JSON.parse(body).variables?.input ?? null;
      return route.fulfill({
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
              placeId: scanInput?.placeHint?.placeId ?? null,
            },
          },
        }),
      });
    }
    return route.fallback();
  });

  await page.goto("/add?mode=menu");
  await expect(
    page.getByRole("heading", { name: "Scan a menu" }),
  ).toBeVisible();
  const card = page.locator('[data-slot="menu-place"]');
  const add = card.getByRole("button", { name: "Add this place" });
  await expect(add).toBeVisible({ timeout: 30_000 });
  await add.tap();

  const sheet = page.getByRole("dialog", { name: "Where's this menu?" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Details pending");
  await expect(sheet).toContainText("Under review");
  expect(creates, "opening the sheet creates nothing").toBe(0);

  await sheet.getByLabel("Name").fill(newName);
  await sheet.getByRole("radio", { name: "Wine Bar" }).tap();
  await sheet.getByRole("button", { name: "Add place", exact: true }).tap();
  await expect(sheet).toBeHidden();
  expect(creates).toBe(1);
  const created = createInput as unknown as {
    name: string;
    categories: string[];
    placeId: string;
    location: { lat: number; lng: number };
  };
  expect(created.name).toBe(newName.replace(/\s+/g, " ").trim());
  expect(created.categories).toEqual(["wine_bar"]);
  expect(created.placeId).toBeTruthy();
  expect(created.location.lat).toBeCloseTo(NOWHERE.latitude, 4);
  await expect(card).toContainText(created.name);

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
  const sent = scanInput as unknown as {
    originalImageId: string;
    placeHint: { placeId: string };
  };
  // Settled before the upload (L24): the scan names the new place.
  expect(sent.placeHint.placeId).toBe(created.placeId);

  const cleanup = await Gql.forAccount("primary");
  try {
    await cleanup.query(
      `mutation D($id: ID!) { deleteFile(fileId: $id) { __typename } }`,
      { id: sent.originalImageId },
    );
  } finally {
    await cleanup.dispose();
  }
});
