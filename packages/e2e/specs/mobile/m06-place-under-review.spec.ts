import { unique } from "../../fixtures/data.ts";
import { deletePlace, holdPlaceInReview } from "../../fixtures/db.ts";
import { expect, test } from "../../fixtures/mobile.ts";
import { Gql } from "../../fixtures/test.ts";

/**
 * X27 / D28 · a place you add is yours alone until it is reviewed — at
 * 390x844, thumb-first.
 *
 * One place, created through the form like a person would, and then walked
 * through the states D28 defines:
 *
 *  1. **Saved at once, under review.** The form says only you can see it; the
 *     place page carries "Under review" with Edit and Delete.
 *  2. **Nobody else can see it — not even that it exists.** The second test
 *     account asks for it by id and gets the same `NotFoundError` an id that
 *     names nothing gets, and a street-level `mapBrowse` around it does not
 *     contain it.
 *  3. **Rejected: the reason, then Edit & resubmit.** The edit screen opens on
 *     the place's own values with the reason on top; saving sends it for
 *     review again.
 *  4. **Delete** removes it, with a confirm sheet.
 *
 * The review state is *held* (`holdPlaceInReview`) rather than waited for: on
 * a lane with a working model the review may approve the place within seconds,
 * and on one without it never runs — neither is what this spec is about. The
 * fixture deletes the queued review and re-stamps the submission, so an
 * in-flight verdict is discarded as stale.
 *
 * Creates exactly one place, and deletes it (through the UI in the last test,
 * through the database in `afterAll` whatever happened before).
 */
test.describe.configure({ mode: "serial" });

let placeId: string | undefined;
let placeName: string;
let deletedInUi = false;

test.afterAll(async () => {
  if (placeId === undefined || deletedInUi) return;
  await deletePlace(placeId, { waitForRowMs: 30_000 });
});

const PLACE_QUERY = `query P($id: ID!) { place(id: $id) {
  __typename
  ... on Place { id name reviewStatus rejectionReason }
  ... on ActorError { code message }
} }`;

test("a new place is saved at once, and only its creator can see it", async ({
  page,
  noise,
}) => {
  test.setTimeout(90_000);
  placeName = unique("X27 Place");
  const lat = 43.0731 + Math.random() * 0.01;
  const lng = -89.4012 + Math.random() * 0.01;

  await page.goto(`/map/create-place?lat=${lat}&lng=${lng}`);
  await expect(
    page.getByRole("heading", { name: "Add a new place" }),
  ).toBeVisible();
  await expect(page.getByText("Loading address...")).toBeHidden({
    timeout: 30_000,
  });
  await page.getByLabel("Name *").fill(placeName);
  await page.getByLabel("Categories *").click();
  await page.getByRole("option", { name: "Wine Bar" }).click();
  await page.keyboard.press("Escape");

  const created = page.waitForRequest(
    (request) =>
      request.url().includes("/api/graphql") &&
      /mutation MapCreatePlace\b/.test(request.postData() ?? ""),
  );
  await page.getByRole("button", { name: "Add Place" }).click();
  const request = await created;
  placeId = request.postDataJSON()?.variables?.input?.placeId;
  expect(placeId).toMatch(/^[0-9a-f-]{36}$/);
  const body = await (await request.response())?.json().catch(() => null);
  expect(
    body?.data?.createPlace?.__typename,
    `createPlace did not create the place: ${JSON.stringify(body)}`,
  ).toBe("CreatePlacePayload");
  expect(body?.data?.createPlace?.place?.reviewStatus).toBe("PENDING");

  // The form says what happened, in words: saved, and whose it is.
  await expect(
    page.getByText("Only you can see it until it's been checked."),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(new RegExp(`/map\\?placeId=${placeId}`));

  holdPlaceInReview(placeId ?? "", "pending");

  await page.goto(`/places/${placeId}`);
  await expect(page.getByRole("heading", { name: placeName })).toBeVisible({
    timeout: 20_000,
  });
  const panel = page.getByTestId("place-review-panel");
  await expect(panel.getByText("Under review")).toBeVisible();
  await expect(
    panel.getByText("Only you can see it until it's been checked"),
  ).toBeVisible();
  await expect(panel.getByRole("link", { name: "Edit" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Delete" })).toBeVisible();
  expect(noise.pageErrors, "the place page threw").toEqual([]);
});

test("to anyone else it does not exist — by id, and on the map", async () => {
  test.skip(placeId === undefined, "no place was created");
  const mine = await Gql.forAccount("primary");
  const theirs = await Gql.forAccount("secondary");
  try {
    const own = await mine.query(PLACE_QUERY, { id: placeId });
    expect(own.place.reviewStatus).toBe("PENDING");

    const hidden = await theirs.query(PLACE_QUERY, { id: placeId });
    const absent = await theirs.query(PLACE_QUERY, {
      id: "00000000-0000-4000-8000-000000000000",
    });
    expect(hidden.place.__typename).toBe("NotFoundError");
    expect(hidden.place.__typename).toBe(absent.place.__typename);
    expect(hidden.place.code).toBe(absent.place.code);

    const lngLat = (
      await mine.query(
        `query L($id: ID!) { place(id: $id) { ... on Place { location { lng lat } } } }`,
        { id: placeId },
      )
    ).place.location as { lng: number; lat: number };
    const bounds = {
      west: lngLat.lng - 0.004,
      east: lngLat.lng + 0.004,
      south: lngLat.lat - 0.004,
      north: lngLat.lat + 0.004,
    };
    const browse = `query M($bounds: MapBoundsInput!) {
      mapBrowse(bounds: $bounds, first: 100, limit: 500) {
        ... on MapEntryConnection {
          edges { node { __typename ... on MapPlace { id reviewStatus } } }
        }
      }
    }`;
    const ids = (data: any): string[] =>
      (data.mapBrowse.edges ?? []).map((edge: any) => edge.node.id);
    const forMe = await mine.query(browse, { bounds });
    expect(ids(forMe)).toContain(placeId);
    expect(
      forMe.mapBrowse.edges.find((edge: any) => edge.node.id === placeId)?.node
        .reviewStatus,
    ).toBe("PENDING");
    expect(ids(await theirs.query(browse, { bounds }))).not.toContain(placeId);
  } finally {
    await mine.dispose();
    await theirs.dispose();
  }
});

test("rejected: the reason, then Edit & resubmit sends it back for review", async ({
  page,
  noise,
}) => {
  test.skip(placeId === undefined, "no place was created");
  test.setTimeout(60_000);
  holdPlaceInReview(placeId ?? "", "rejected", "Looks like a private home.");

  await page.goto(`/places/${placeId}`);
  const panel = page.getByTestId("place-review-panel");
  await expect(panel.getByText("Not approved")).toBeVisible({
    timeout: 20_000,
  });
  await expect(panel.getByText(/Looks like a private home\./)).toBeVisible();

  await panel.getByRole("link", { name: "Edit & resubmit" }).click();
  await expect(page).toHaveURL(new RegExp(`/places/${placeId}/edit$`));
  await expect(page.getByTestId("edit-rejection-reason")).toContainText(
    "Looks like a private home.",
  );
  await expect(page.getByLabel("Name *")).toHaveValue(placeName);

  placeName = `${placeName} Wine Room`;
  await page.getByLabel("Name *").fill(placeName);
  const resubmitted = page.waitForResponse(
    (response) =>
      response.url().includes("/api/graphql") &&
      /mutation ResubmitPlace\b/.test(response.request().postData() ?? ""),
  );
  await page.getByRole("button", { name: "Send for review" }).click();
  const answer = await (await resubmitted).json();
  expect(answer?.data?.resubmitPlace?.reviewStatus).toBe("PENDING");
  holdPlaceInReview(placeId ?? "", "pending");

  await expect(page).toHaveURL(new RegExp(`/places/${placeId}$`), {
    timeout: 15_000,
  });
  // The page may have read the place before the hold above landed (a fast
  // model can decide a resubmission in the gap); read it again.
  await page.reload();
  await expect(page.getByRole("heading", { name: placeName })).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByTestId("place-review-panel").getByText("Under review"),
  ).toBeVisible();
  await expect(page.getByText(/Looks like a private home/)).toHaveCount(0);
  expect(noise.pageErrors, "the edit flow threw").toEqual([]);
});

test("delete removes it, after a confirm", async ({ page, noise }) => {
  test.skip(placeId === undefined, "no place was created");
  await page.goto(`/places/${placeId}`);
  const panel = page.getByTestId("place-review-panel");
  await panel.getByRole("button", { name: "Delete" }).click();

  const sheet = page.getByRole("alertdialog");
  await expect(sheet.getByText(`Delete ${placeName}?`)).toBeVisible();
  await sheet.getByRole("button", { name: "Delete" }).click();

  await expect(page).toHaveURL(/\/map(?:[?#]|$)/, { timeout: 15_000 });
  deletedInUi = true;

  const mine = await Gql.forAccount("primary");
  try {
    const gone = await mine.query(PLACE_QUERY, { id: placeId });
    expect(gone.place.__typename).toBe("NotFoundError");
  } finally {
    await mine.dispose();
  }
  expect(noise.pageErrors, "deleting threw").toEqual([]);
});
