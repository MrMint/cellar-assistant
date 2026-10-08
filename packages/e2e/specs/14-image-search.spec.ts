import { aiCapabilities } from "../fixtures/data.ts";
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
 * rather than assumes: `me.aiCapabilities.imageSearch` (N07/D25). Image
 * search needs an image-capable embedding model (`gemini-embedding-2` on
 * Vertex or the Gemini API); a lane running `AI_PROVIDER=ollama` with a
 * text-only embedder reports `imageSearch: false`.
 *
 * - Where it is offered, the Photo button photographs, uploads and searches,
 *   and the page shows the old results block (a test pattern matches nothing,
 *   so the old empty state, or a grid if something is that close).
 * - Where it is not, N07/D25 **hides** the feature instead of offering it and
 *   refusing: `/search` has no Photo button, and the onboarding wizard never
 *   asks for a photo match — it keeps the photo and moves on. That replaced
 *   the earlier "the page must say photo search is not available" contract.
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
  const { imageSearch } = await aiCapabilities(api);
  const noise = watch(primary);
  await primary.goto("/search");
  const photo = primary.getByRole("button", { name: "Photo" });
  if (!imageSearch) {
    // Hidden, not refused. `toHaveCount(0)` retries, so it also waits out the
    // first paint, which offers every feature until the answer lands.
    await expect(primary.getByRole("button", { name: "Scan" })).toBeVisible();
    await expect(photo).toHaveCount(0);
    expect(noise.pageErrors, "the search page threw").toEqual([]);
    return;
  }
  await photo.click();

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

  // The capability said yes, so the API must agree: a refusal here is the
  // capability lying, which is exactly what N07 exists to prevent.
  const answer = await imageSearchAnswer(api, imageFileId);
  expect(answer?.__typename, JSON.stringify(answer)).toBe(
    "ItemSearchConnection",
  );
  await expect(
    primary
      .getByText("No items found matching the image")
      .or(primary.locator("a[href*='/wines/'], a[href*='/beers/']").first()),
  ).toBeVisible();

  // The photo has done its one job and is discarded, row and object.
  const file = await api.raw(
    `query F($id: ID!) { file(id: $id) { __typename } }`,
    { id: imageFileId },
  );
  expect(file.data?.file?.__typename, JSON.stringify(file)).toBe(
    "NotFoundError",
  );
  expect(noise.pageErrors, "the search page threw").toEqual([]);
});

test("another person's search photo is not searchable by you", async ({
  primary,
  api,
  api2,
}) => {
  test.setTimeout(120_000);
  const { imageSearch } = await aiCapabilities(api);
  // The page offers no way to take a search photo here, and the API's
  // capability check refuses every `imageFileId` before any file is read.
  test.skip(
    !imageSearch,
    "image search is not offered on this stack (me.aiCapabilities.imageSearch is false)",
  );
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
  api,
}) => {
  test.setTimeout(150_000);
  const { imageSearch } = await aiCapabilities(api);
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
  // Every match request the wizard sends, so the unavailable branch can
  // assert there was none (`searchByImage.ts` asks the capability first).
  const matchRequests: string[] = [];
  primary.on("request", (request) => {
    const body = request.postData() ?? "";
    if (request.method() === "POST" && body.includes("OnboardingImageMatches"))
      matchRequests.push(body);
  });
  const matched = imageSearch
    ? primary.waitForRequest(
        (request) =>
          request.method() === "POST" &&
          (request.postData() ?? "").includes("OnboardingImageMatches"),
        { timeout: 60_000 },
      )
    : null;
  await primary.getByRole("button", { name: "Take photo" }).click();

  if (matched !== null) {
    const body = JSON.parse((await matched).postData() ?? "{}");
    expect(body.variables?.imageFileId).toMatch(UUID);
    // Narrowed to the type being added.
    expect(body.variables?.itemTypes).toEqual(["BEER"]);
  }

  // No match (a test pattern), or photo search not offered: the wizard
  // finishes with the photo kept and moves on, as the old one did on an
  // empty result — it does not stall on the search.
  await expect(
    primary.getByText("Lets take a photo that will be used for display"),
  ).toBeHidden({ timeout: 60_000 });
  if (!imageSearch) {
    expect(
      matchRequests,
      "a photo match was requested on a stack that cannot search by image",
    ).toEqual([]);
  }
});
