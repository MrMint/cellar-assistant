import { expect, test } from "../fixtures/test.ts";

/**
 * A photographed label is uploaded and handed to the extraction.
 *
 * Chromium's fake camera (`--use-fake-device-for-media-stream`, permission
 * granted by `--use-fake-ui-for-media-stream`) supplies a test pattern, so this
 * drives the real capture → presigned PUT → `startItemOnboarding` path with a
 * picture that is not a label. The model (or the lack of one) must say so —
 * the form shows "Nothing was read from the label" and stays empty — rather
 * than invent a wine off a colour chart, which is E2c/E2g again. The request
 * itself is checked to carry the uploaded file id, since a capture that never
 * reached the session would produce the same empty form.
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
  await primary.goto("/add/beers");
  await primary.getByRole("button", { name: "Skip" }).click(); // barcode

  await expect(
    primary.getByText("Lets take a picture of the back label"),
  ).toBeVisible();
  await primary.getByRole("button", { name: "Skip" }).click(); // back

  // Front label: wait for the stream so `getScreenshot` has a frame.
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

  await expect(
    primary.getByText("Lets take a photo that will be used for display"),
  ).toBeVisible();
  await primary.getByRole("button", { name: "Skip" }).click(); // display

  const body = JSON.parse((await started).postData() ?? "{}");
  expect(
    body.variables?.input?.frontLabelImageId,
    "the captured label never reached startItemOnboarding",
  ).toMatch(/^[0-9a-f-]{36}$/);

  await expect(
    primary.getByRole("button", { name: "Add", exact: true }),
  ).toBeVisible({ timeout: 120_000 });
  await expect(
    primary.getByText(/Nothing was read from the label/),
    "a test pattern was read as a label",
  ).toBeVisible();
  expect(await primary.getByLabel("Name").inputValue()).toBe("");
});
