import { createCellar, unique } from "../fixtures/data.ts";
import { deleteCellarWithContents } from "../fixtures/db.ts";
import { expect, test, watch } from "../fixtures/test.ts";

/**
 * The bottle page's "Add a photo" opens the live camera again (UI parity
 * gap #1): `82450ad1:src/components/item/AddPhoto.tsx` mounted
 * `CameraCapture`, and the restore had swapped it for a bare file picker.
 *
 * Chromium's fake camera (as in 04b) supplies a test pattern, so this drives
 * the real capture → data URL decoded in the browser → presigned PUT →
 * `attachItemImage` → `updateCellarItem(displayImageId)` path, and checks the
 * bottle then shows the photo instead of the fallback art.
 *
 * A tea, as in 11 (`createItem` writes one without the onboarding flow).
 * Items have no delete, so the tea outlives the run; the cellar does not.
 */
test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});
test.describe.configure({ mode: "serial" });

let cellarId: string;
let bottleId: string;

test.afterAll(() => {
  if (cellarId !== undefined) deleteCellarWithContents(cellarId);
});

test("fixtures: a cellar with a bottle of tea", async ({ api }) => {
  cellarId = await createCellar(api, unique("E2 Camera"), "PRIVATE");
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
    {
      id: crypto.randomUUID(),
      input: { name: unique("E2 Camera Tea"), tea: { category } },
    },
  );
  expect(
    created.createItem.__typename,
    JSON.stringify(created.createItem),
  ).toBe("MutationCreateItemSuccess");
  const added = await api.query(
    `mutation A($cellarId: ID!, $input: AddCellarItemInput!) {
       addItemToCellar(cellarId: $cellarId, input: $input) {
         __typename ... on CellarItem { id } ... on Error { message }
       }
     }`,
    {
      cellarId,
      input: {
        cellarItemId: crypto.randomUUID(),
        item: { id: created.createItem.data.id, type: "TEA" },
      },
    },
  );
  expect(added.addItemToCellar.__typename).toBe("CellarItem");
  bottleId = added.addItemToCellar.id;
});

test("Add a photo opens the live camera, and a capture becomes the bottle's photo", async ({
  primary,
}) => {
  test.setTimeout(120_000);
  const noise = watch(primary);
  await primary.goto(`/cellars/${cellarId}/teas/${bottleId}`);
  await primary.getByText("Add a photo").click();

  const dialog = primary.getByRole("dialog");
  await expect(dialog.getByText("Set a new display image")).toBeVisible();
  // The file input stays as the fallback beside the viewfinder.
  await expect(
    dialog.getByRole("button", { name: "Choose a photo" }),
  ).toBeVisible();

  // Wait for the stream so `getScreenshot` has a frame (as 04b does).
  await expect(dialog.locator("video")).toBeVisible();
  await primary.waitForFunction(
    () => (document.querySelector("video")?.readyState ?? 0) >= 2,
  );
  const saved = primary.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      (response.request().postData() ?? "").includes(
        "SetCellarItemDisplayImage",
      ),
    { timeout: 60_000 },
  );
  await dialog.getByRole("button", { name: "Take photo" }).click();
  const body = await (await saved).json();
  expect(body.data?.updateCellarItem?.__typename, JSON.stringify(body)).toBe(
    "CellarItem",
  );

  // The dialog closes and the page refreshes onto the new photo.
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(primary.getByText("Update photo")).toBeVisible({
    timeout: 30_000,
  });
  await expect(primary.getByText("Add a photo")).toBeHidden();
  expect(noise.pageErrors).toEqual([]);
});
