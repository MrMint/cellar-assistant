import { createCellar, unique } from "../fixtures/data.ts";
import { deleteCellarWithContents } from "../fixtures/db.ts";
import {
  bodyText,
  expect,
  settleNetwork,
  test,
  watch,
} from "../fixtures/test.ts";

/**
 * Onboard a wine, put it in a cellar, check it in.
 *
 * The longest chain in the app and the one with the most seams. Since UI
 * parity wave 4 it runs through the restored `82450ad1` wizard
 * (`components/common/OnboardingWizard`): a camera barcode step, back label,
 * front label and display photo — each with Skip — then `startItemOnboarding`,
 * the old `{T}Form` in create mode, `confirmItemOnboarding` (an id for a row
 * **the outbox has not written yet**, so the form waits for `ItemActor` to
 * write it), `addItemToCellar` and "Would you like to add another item?". The
 * headless browser has no camera, so the default flow is Skip ×4 — the same
 * path a person without a label to photograph takes.
 *
 * The three standalone tests at the bottom are deliberately outside that chain:
 * each is a known-or-found defect in its own right, and a defect should not
 * suppress the flow it happens to sit next to.
 */

let cellarId: string;
let cellarName: string;
let itemId: string;

test.describe("onboard → cellar → check in", () => {
  test.describe.configure({ mode: "serial" });

  // The cellar ends up holding the wine and its check-in, and `deleteCellar`
  // refuses a cellar with items, so this goes a layer down (`./db.ts`).
  test.afterAll(() => {
    if (cellarId !== undefined) deleteCellarWithContents(cellarId);
  });

  test("a cellar to put it in", async ({ api }) => {
    cellarName = unique("E2 Onboarding");
    cellarId = await createCellar(api, cellarName, "PRIVATE");
  });

  test("onboards a wine into the cellar through the restored wizard", async ({
    api,
    primary,
  }) => {
    const noise = watch(primary);
    const name = unique("E2 Wine");

    await primary.goto(`/cellars/${cellarId}/wines/add`);
    await expect(
      primary.getByRole("heading", { name: "Add Wine" }),
    ).toBeVisible();

    // Barcode, back label, front label, display photo — Skip each. The
    // barcode step's Skip is disabled once a code was scanned, never here.
    for (const step of [
      "Lets start by scanning the barcode",
      "Lets take a picture of the back label",
      "Lets take a picture of the front label",
      "Lets take a photo that will be used for display",
    ]) {
      await expect(primary.getByText(step)).toBeVisible();
      await primary.getByRole("button", { name: "Skip" }).click();
    }

    // "Analyzing..." while `startItemOnboarding` runs; with no photograph the
    // server refuses to invent (E2c), the session stays open, and the form
    // comes up empty. No alert for that: nothing was sent to be read.
    const add = primary.getByRole("button", { name: "Add", exact: true });
    await expect(
      add,
      "the form never appeared — startItemOnboarding did not answer",
    ).toBeVisible({ timeout: 45_000 });
    expect(await primary.getByLabel("Name").inputValue()).toBe("");
    await expect(primary.getByText(/Nothing was read/)).toHaveCount(0);

    await primary.getByLabel("Name").fill(name);
    // The old form's vintage is a year (`wines.vintage` is a NOT NULL date).
    await primary.getByLabel("Vintage").fill("2019");
    await primary.getByRole("combobox", { name: /Style/ }).click();
    const style = primary.getByRole("option").first();
    await expect(
      style,
      "no wine styles offered — reference data may not be seeded",
    ).toBeVisible({ timeout: 15_000 });
    await style.click();

    await add.click();

    // Confirm → wait for the outbox to write the item → `addItemToCellar` →
    // the old final prompt. Reaching it means the row exists and the bottle
    // was filed.
    await expect(
      primary.getByText("Would you like to add another item?"),
      "the wizard never reached the final prompt — the confirm was rejected or the outbox did not deliver ItemActor.create",
    ).toBeVisible({ timeout: 60_000 });
    await primary.getByRole("button", { name: "No" }).click();

    // Decision 1: in a cellar, "No" lands on the bottle.
    await expect(primary).toHaveURL(
      new RegExp(`/cellars/${cellarId}/wines/[0-9a-f-]{36}$`),
      { timeout: 30_000 },
    );

    // Read it back through a different path than the one that wrote it.
    const cellar = await api.query(
      `query C($id: ID!) { cellar(id: $id) {
         __typename
         ... on Cellar { items(first: 20) { edges { node { id item { id name } } } } }
         ... on Error { message }
       } }`,
      { id: cellarId },
    );
    expect(cellar.cellar.__typename).toBe("Cellar");
    const entry = cellar.cellar.items.edges.find(
      (e: any) => e.node.item?.name === name,
    );
    expect(entry, "the onboarded wine is not in the cellar").toBeDefined();
    itemId = entry.node.item.id;
    expect(primary.url()).toContain(entry.node.id);

    expect(
      noise.pageErrors,
      "the onboarding wizard threw while saving",
    ).toEqual([]);
  });

  /**
   * The check-in, through the API.
   *
   * Split from the page test below because they fail for different reasons and
   * the distinction is the whole point: while `/cellars/[cellarId]` is 500ing,
   * "check-in does not work" would be true of the page and false of the domain.
   * This says which.
   */
  test("the wine can be checked in through the API", async ({ api }) => {
    test.skip(itemId === undefined, "no wine was onboarded");

    const cellar = await api.query(
      `query C($id: ID!) { cellar(id: $id) {
         __typename
         ... on Cellar { items(first: 20) { edges { node { id item { id } } } } }
         ... on Error { message }
       } }`,
      { id: cellarId },
    );
    expect(cellar.cellar.__typename).toBe("Cellar");
    const entry = cellar.cellar.items.edges.find(
      (e: any) => e.node.item?.id === itemId,
    );
    expect(
      entry,
      "the onboarded wine is not in the cellar it was saved into — `CellarActor.addItem` did not land",
    ).toBeDefined();

    const result = await api.query(
      `mutation Ci($cellarId: ID!, $cellarItemId: ID!) {
         checkIn(cellarId: $cellarId, cellarItemId: $cellarItemId) {
           __typename
           ... on CheckIn { id }
           ... on Error { message }
         }
       }`,
      { cellarId, cellarItemId: entry.node.id },
    );
    expect(
      result.checkIn.__typename,
      `checkIn returned ${result.checkIn.__typename}: ${result.checkIn.message}`,
    ).toBe("CheckIn");
  });

  test("the wine is in the cellar and can be checked in from the page", async ({
    primary,
  }) => {
    test.skip(itemId === undefined, "no wine was onboarded");

    const response = await primary.goto(`/cellars/${cellarId}`);
    expect(response?.status(), "the cellar page did not render").toBeLessThan(
      400,
    );

    expect(
      await bodyText(primary),
      "the cellar page does not show its new item",
    ).toMatch(/E2 Wine/);

    // "Check in" opens a menu; "Just me" is the one-click path.
    const checkIn = primary.getByRole("button", { name: "Check in" });
    await expect(
      checkIn.first(),
      "no check-in control on the cellar page",
    ).toBeVisible({ timeout: 20_000 });
    await checkIn.first().click();
    await primary.getByRole("menuitem", { name: "Just me" }).click();

    // The check-in list is written by `CellarActor`; a check-in that only
    // turned a spinner off has not been proved.
    await expect(
      primary.getByText(/check.?in/i).first(),
      "the check-in did not produce any visible result",
    ).toBeVisible({ timeout: 20_000 });
  });
});

/**
 * The label-image half of the flow — a real upload, since E3 landed.
 *
 * This used to assert the *blocker*: `createUploadTarget` signed against
 * `http://minio:9000`, the signature covers the host, and so no browser
 * outside the compose network could PUT to it. The assertion was deliberately
 * the wrong way round — it failed the day the URL stopped being internal and
 * told whoever fixed E3 to promote it to a real upload test. This is that
 * promotion.
 *
 * E3's answer was not one routable hostname: on Docker Desktop for macOS no
 * single address reaches MinIO from both a host browser and a container, so the
 * authority a presigned URL carries follows the caller who will dial it
 * (`services/actors/src/lib/s3-presign.ts` §E3). What this test pins down is
 * the browser's half, with a browser: the `fetch` runs in the page, so the
 * app's own `connect-src` has to permit the origin — a CSP miss makes the
 * request never happen at all, and that is baked into the client image at build
 * time, not read at runtime.
 *
 * `verifyUpload` afterwards is what makes this evidence rather than a 200: the
 * actor host asks the object store whether the bytes are really there, decides
 * the media type from those bytes, and rewrites the stored `Content-Type`
 * (commit 7bdbc4da). A PUT that landed somewhere else cannot satisfy it.
 */
test("a browser can PUT a label image to the presigned URL (E3)", async ({
  api,
  primary,
}) => {
  const data = await api.raw(
    `mutation { createUploadTarget(input: { kind: "label-front", contentType: "image/png" }) {
       __typename
       ... on UploadTarget { uploadUrl fileId bucket key }
       ... on Error { message }
     } }`,
  );
  const target = data.data?.createUploadTarget;
  test.skip(
    data.errors !== undefined || target === undefined,
    `createUploadTarget is not answering: ${JSON.stringify(data.errors ?? {})}`,
  );
  if (target.__typename !== "UploadTarget") return;

  expect(
    target.uploadUrl,
    "the presigned URL is signed for the compose-internal MinIO host again — a browser cannot dial that, so E3 has regressed",
  ).not.toContain("minio:9000");

  await primary.goto("/cellars");
  await settleNetwork(primary);

  // A 1x1 PNG: `FileActor.verify` decides the type from the bytes, so this has
  // to be a real image. 70 bytes, and the last 2 of those matter: the previous
  // fixture was 68 and declared 1×1 RGBA while carrying a 3-byte raster where
  // 5 are required, which strict decoders reject. See `09-menu-scan.spec.ts`.
  const put = await primary.evaluate(
    async ([url, base64]) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1)
        bytes[i] = binary.charCodeAt(i);
      try {
        const response = await fetch(url, {
          method: "PUT",
          body: bytes,
          headers: { "content-type": "image/png" },
          credentials: "omit",
        });
        return { status: response.status, error: null as string | null };
      } catch (error) {
        return {
          status: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    [
      target.uploadUrl,
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNoaGj4DwAFhAKAU5N0NgAAAABJRU5ErkJggg==",
    ] as const,
  );
  expect(
    put,
    `the browser could not PUT to ${new URL(target.uploadUrl).origin} — either the CSP does not permit that origin (NEXT_PUBLIC_FILE_ORIGINS, baked at build time) or the signer used an authority this machine cannot dial`,
  ).toEqual({ status: 200, error: null });

  const verified = await api.query(
    `mutation V($fileId: ID!) { verifyUpload(fileId: $fileId) {
       __typename
       ... on File { id mimeType size verifiedAt }
       ... on Error { message }
     } }`,
    { fileId: target.fileId },
  );
  const file = verified.verifyUpload;
  expect(file.__typename, JSON.stringify(file)).toBe("File");
  expect(
    file.verifiedAt,
    "the object store did not confirm the upload",
  ).not.toBeNull();
  // From the bytes, not from the request: the PUT above could have claimed
  // anything, and `Content-Type` is not covered by the signature.
  expect(file.mimeType).toBe("image/png");
  expect(file.size).toBe(70);
});

/**
 * An onboarding with no label image must not invent one.
 *
 * **What this used to find.** `startItemOnboarding(input: { itemType: WINE })`
 * with no `frontLabelImageId`, no `backLabelImageId` and no barcode returned
 * `status: COMPLETED` carrying a complete, specific, entirely fabricated wine —
 * "Domaine de la Romanée-Conti", "Château d'Yquem", a different one each run —
 * at `confidence: 0.9`+, with a `style` outside the five-value `wine_style` enum
 * into the bargain. E2c.
 *
 * **What it asserts now.** A refusal, and a refusal that leaves the session
 * usable. `requireExtractableInput` (`services/actors/src/lib/item-defaults.ts`)
 * turns "read a label I did not give you" into a `ConflictError` before the
 * model is called at all — a *state* problem, so the row is written `FAILED`
 * and `confirmItemOnboarding` still works against it, which is what lets the
 * wizard treat this as "fill it in yourself" rather than a dead end.
 */
test("a no-image onboarding is refused rather than invented", async ({
  api,
}) => {
  const onboardingId = crypto.randomUUID();
  const data = await api.query(
    `mutation S($id: ID!) {
       startItemOnboarding(input: { itemType: WINE }, onboardingId: $id) {
         __typename
         ... on ItemOnboarding { id status defaults confidence aiModel }
         ... on Error { message }
       }
     }`,
    { id: onboardingId },
  );
  const onboarding = data.startItemOnboarding;
  expect(
    onboarding.__typename,
    `an onboarding with no image returned ${onboarding.__typename} instead of refusing: ${JSON.stringify(onboarding)}`,
  ).toBe("ConflictError");
  expect(
    onboarding.message,
    "the refusal does not say why there was nothing to read",
  ).toMatch(/no label photograph/i);

  // The session is still open — the row exists, so `confirm` has something to
  // point at. This is the half that makes the refusal non-fatal.
  const after = await api.query(
    `query O($id: ID!) { itemOnboarding(id: $id) {
       __typename
       ... on ItemOnboarding { id status defaults }
       ... on Error { message }
     } }`,
    { id: onboardingId },
  );
  expect(
    after.itemOnboarding.__typename,
    `the refused onboarding left no row to confirm against: ${JSON.stringify(after.itemOnboarding)}`,
  ).toBe("ItemOnboarding");
  expect(after.itemOnboarding.status).toBe("FAILED");
  expect(
    after.itemOnboarding.defaults,
    "a refused extraction still wrote defaults",
  ).toBeNull();
});
