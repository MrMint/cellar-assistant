import { expect, test } from "../fixtures/test.ts";

/**
 * A photographed label is uploaded and handed to the extraction — at the
 * shutter (X05: the read starts there; there is no step after it).
 *
 * Chromium's fake camera (`--use-fake-device-for-media-stream`, permission
 * granted by `--use-fake-ui-for-media-stream`) supplies a test pattern, so this
 * drives the real capture → presigned PUT → `startItemOnboarding` path with a
 * picture that is not a label. The model must say so — the form shows the
 * N07 `AiStatus` alert for a `NOTHING_READ` outcome ("Nothing to read") and
 * stays empty — rather than invent a wine off a colour chart, which is
 * E2c/E2g again. The words are `aiOutcome`'s
 * (`services/client/src/lib/ai/outcome.ts`); the old "Nothing was read from
 * the label" line went with N07. The request itself is checked to carry the
 * uploaded file id, since a capture that never reached the session would
 * produce the same empty form.
 */
test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});

test("a photographed label is uploaded and read honestly", async ({
  primary,
}) => {
  test.setTimeout(150_000);
  // X05: one camera, at once — the shutter is the front label.
  await primary.goto("/add/beers");

  // Wait for the stream so the shutter has a frame.
  await expect(primary.locator("video")).toBeVisible();
  await primary.waitForFunction(
    () => (document.querySelector("video")?.readyState ?? 0) >= 2,
  );
  const started = primary.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      (request.postData() ?? "").includes("StartItemOnboarding"),
    { timeout: 60_000 },
  );
  await primary.getByRole("button", { name: "Take photo" }).click();

  // N21: the particle bottle is up at once, with the photo beside it.
  await expect(primary.getByRole("img", { name: /^Reading:/ })).toBeVisible();
  await expect(
    primary.getByRole("img", { name: "Your label, as snapped" }),
  ).toBeVisible();

  const body = JSON.parse((await started).postData() ?? "{}");
  expect(
    body.variables?.input?.frontLabelImageId,
    "the captured label never reached startItemOnboarding",
  ).toMatch(/^[0-9a-f-]{36}$/);

  await expect(
    primary.getByRole("main").getByRole("button", { name: "Add", exact: true }),
  ).toBeVisible({ timeout: 120_000 });
  await expect(
    primary.getByRole("alert").filter({ hasText: "Nothing to read" }),
    "a test pattern was read as a label",
  ).toBeVisible();
  expect(await primary.getByLabel("Name").inputValue()).toBe("");
});
