import { expect, test, watch } from "../fixtures/test.ts";

/**
 * Image search (G32), through the real camera path: `/search`'s Photo button
 * and the onboarding wizard's display-photo match.
 *
 * Chromium's fake camera (as in 04b and 13) supplies a test pattern, so this
 * drives capture → data URL decoded in the browser → presigned `image-search`
 * PUT → `verifyUpload` → `itemSearch(imageFileId:)`.
 *
 * **What it can assert depends on the stack's embedding model**, and it asks
 * rather than assumes. Image search needs `gemini-embedding-2` (Vertex or
 * the Gemini API); the shared lane runs `AI_PROVIDER=ollama`, whose embedding
 * model is text only, so there the API answers `IMAGE_SEARCH_UNAVAILABLE` and
 * the page must say photo search is not available — not "no items", which
 * would be a different and false claim. On a stack that *can* embed a photo,
 * the same test asserts the old results block instead (a test pattern matches
 * nothing, so the old empty state, or a grid if something is that close).
 */
test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** What the API says about a photo search, for the file the page uploaded. */
const imageSearchAnswer = async (
  api: { raw: (q: string, v?: Record<string, unknown>) => Promise<any> },
  imageFileId: string,
) => {
  const data = await api.raw(
    `query S($id: ID!) { itemSearch(imageFileId: $id, first: 10) {
       __typename
       ... on ItemSearchConnection { edges { node { id } } }
       ... on ActorError { code reason message }
     } }`,
    { id: imageFileId },
  );
  return data.data?.itemSearch as
    | { __typename: string; reason?: string | null; code?: string }
    | undefined;
};

test("the Photo button photographs, uploads and searches — and says so honestly", async ({
  primary,
  api,
}) => {
  test.setTimeout(120_000);
  const noise = watch(primary);
  await primary.goto("/search");
  await primary.getByRole("button", { name: "Photo" }).click();

  // The old card, verbatim.
  await expect(primary.getByText("Take a picture of the item")).toBeVisible();
  await expect(primary.locator("video")).toBeVisible();
  await primary.waitForFunction(
    () => (document.querySelector("video")?.readyState ?? 0) >= 2,
  );
  await primary.getByRole("button", { name: "Take photo" }).click();

  await primary.waitForURL(/\/search\?image=/, { timeout: 60_000 });
  const imageFileId =
    new URL(primary.url()).searchParams.get("image") ?? "missing";
  expect(imageFileId, "the URL carries the uploaded file's id").toMatch(UUID);
  await expect(
    primary.getByText("Image search results", { exact: true }),
  ).toBeVisible();

  const answer = await imageSearchAnswer(api, imageFileId);
  if (answer?.reason === "IMAGE_SEARCH_UNAVAILABLE") {
    await expect(
      primary.getByText(/Photo search isn't available here/),
    ).toBeVisible();
    await expect(primary.getByText(/No items found/)).toHaveCount(0);
  } else {
    expect(answer?.__typename, JSON.stringify(answer)).toBe(
      "ItemSearchConnection",
    );
    await expect(
      primary
        .getByText("No items found matching the image")
        .or(primary.locator("a[href*='/wines/'], a[href*='/beers/']").first()),
    ).toBeVisible();
  }
  expect(noise.pageErrors, "the search page threw").toEqual([]);
});

test("another person's search photo is not searchable by you", async ({
  primary,
  api2,
}) => {
  test.setTimeout(120_000);
  await primary.goto("/search");
  await primary.getByRole("button", { name: "Photo" }).click();
  await expect(primary.locator("video")).toBeVisible();
  await primary.waitForFunction(
    () => (document.querySelector("video")?.readyState ?? 0) >= 2,
  );
  await primary.getByRole("button", { name: "Take photo" }).click();
  await primary.waitForURL(/\/search\?image=/, { timeout: 60_000 });
  const imageFileId = new URL(primary.url()).searchParams.get("image") ?? "";

  const answer = await imageSearchAnswer(api2, imageFileId);
  // Where the stack cannot embed a photo the capability check answers first
  // and nothing is read; where it can, FileActor refuses the second account.
  // Either way, never a result list built from somebody else's photo.
  expect(answer?.__typename, JSON.stringify(answer)).not.toBe(
    "ItemSearchConnection",
  );
});

test("onboarding: a display photo of a new item is matched against the catalogue first", async ({
  primary,
}) => {
  test.setTimeout(150_000);
  await primary.goto("/add/beers");
  await primary.getByRole("button", { name: "Skip" }).click(); // barcode
  await expect(
    primary.getByText("Lets take a picture of the back label"),
  ).toBeVisible();
  await primary.getByRole("button", { name: "Skip" }).click(); // back
  await expect(
    primary.getByText("Lets take a picture of the front label"),
  ).toBeVisible();
  await primary.getByRole("button", { name: "Skip" }).click(); // front

  await expect(
    primary.getByText("Lets take a photo that will be used for display"),
  ).toBeVisible();
  await expect(primary.locator("video")).toBeVisible();
  await primary.waitForFunction(
    () => (document.querySelector("video")?.readyState ?? 0) >= 2,
  );
  const matched = primary.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      (request.postData() ?? "").includes("OnboardingImageMatches"),
    { timeout: 60_000 },
  );
  await primary.getByRole("button", { name: "Take photo" }).click();

  const body = JSON.parse((await matched).postData() ?? "{}");
  expect(body.variables?.imageFileId).toMatch(UUID);
  // Narrowed to the type being added.
  expect(body.variables?.itemTypes).toEqual(["BEER"]);

  // No match (a test pattern), or photo search unavailable: the wizard
  // finishes with the photo kept and moves on, as the old one did on an
  // empty result — it does not stall on the search.
  await expect(
    primary.getByText("Lets take a photo that will be used for display"),
  ).toBeHidden({ timeout: 60_000 });
});
