import {
  bodyText,
  expect,
  settleNetwork,
  test,
  watch,
} from "../fixtures/test.ts";

/**
 * Menu scans.
 *
 * **E2 found that creation was not blocked by E3, and that was the defect.**
 * The brief carried forward an assumption from the image work — that a menu
 * scan cannot be created because the presigned PUT is signed against
 * `http://minio:9000` and a browser outside the compose network cannot use it.
 * Only the first half was true. `createUploadTarget` mints the `files` row
 * *before* any bytes move, and `createMenuScan` took that `originalImageId`
 * without ever asking whether the upload happened — so a scan of a file that
 * does not exist was created quite happily, and only failed later in the
 * pipeline.
 *
 * **E2d closed that, which put the blocker back**: `MenuScanActor.create` goes
 * through `FileActor.verify`, so an unverified id is refused (the second test)
 * and creation genuinely depended on E3.
 *
 * **E3 has now landed, and the three tests below that were skipped for it run
 * again.** The fix was not one hostname, which is what the earlier note here
 * assumed: on Docker Desktop for macOS no single address reaches MinIO from
 * both a host browser and a container, so the authority a presigned URL
 * carries now depends on who will dial it — `localhost:<published port>` for a
 * browser, `minio:9000` for a caller inside the network
 * (`services/actors/src/lib/s3-presign.ts` §E3 has every measurement). The
 * first test below is the one that matters for this suite: a **real browser**,
 * under the app's real CSP, PUTting real bytes to a URL the API signed.
 *
 * The gate the three tests sit behind is now a runtime condition rather than
 * `const scanId = null`, which was unreachable by construction. If the upload
 * or the scan ever stops working they skip with the reason again, on the spot,
 * instead of failing three times over in the middle of the pipeline.
 */
test.describe.configure({ mode: "serial" });

/**
 * A 1×1 RGBA PNG that genuinely decodes. Small enough to inline.
 *
 * "Real enough to pass byte sniffing" is what the previous fixture claimed, and
 * it was not enough: its IHDR declared 1×1 RGBA, so the raster must inflate to
 * 5 bytes (one filter byte plus four channels), and its IDAT inflated to 3. All
 * three chunk CRCs were valid, so every check that stops at the header or the
 * CRC passed it — `sips` converts it without complaint and a browser renders it.
 * Strict decoders do not: Pillow says "image file is truncated" and Go's
 * `image/png`, which is what Ollama uses, says "not enough pixel data".
 *
 * That made every menu-scan and item-onboarding vision call fail with the
 * provider's `400 Failed to load image or audio file` — read for days as a
 * container networking fault, because the byte-identical request failed from the
 * host too. The fixture was the variable.
 *
 * If you replace this, decode it with something strict before committing:
 * `python3 -c "from PIL import Image; im=Image.open('f.png'); im.load()"`.
 * A viewer opening it proves nothing.
 */
const PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNoaGj4DwAFhAKAU5N0NgAAAABJRU5ErkJggg==";

const UPLOAD_TARGET_MUTATION = `mutation U($input: CreateUploadTargetInput!) {
  createUploadTarget(input: $input) {
    __typename
    ... on UploadTarget { fileId uploadUrl }
    ... on Error { message }
  }
}`;

const CREATE_SCAN_MUTATION = `mutation M($input: CreateMenuScanInput!) {
  createMenuScan(input: $input) {
    __typename
    ... on MenuScan { id processingStatus }
    ... on Error { message }
  }
}`;

/** Set by the first test; `null` keeps the three tests that need it skipped. */
let scanId: string | null = null;

/**
 * Why those three would skip — and they only can if the browser upload above
 * failed, since creation depends on a verified file. Worth spelling out,
 * because for a while this was `const scanId = null` and the skip was
 * permanent rather than conditional.
 */
const SCAN_SKIP_REASON =
  "no menu scan: the first test's browser upload or `createMenuScan` failed, " +
  "so there is nothing to read. That first failure is the real one — start there.";

/**
 * The upload, end to end, in the browser — E3's acceptance criterion.
 *
 * Every part of this is the real thing: `createUploadTarget` signs a URL with
 * MinIO's credentials, the `fetch` runs **in the page**, so the app's own
 * `connect-src` has to permit that origin (a CSP miss fails with no network
 * request at all, which is why this is not an `APIRequestContext` call), and
 * `createMenuScan` only accepts the file because `FileActor.verify` asked the
 * object store whether the bytes are there.
 *
 * `page.evaluate` rather than a UI drag-and-drop: the scan UI's own file input
 * is `04`/`08` territory, and what E3 needs proved is the network path.
 */
test("a browser PUTs to the presigned URL, and a scan is created from it (E3)", async ({
  api,
  primary,
}) => {
  const data = await api.query(UPLOAD_TARGET_MUTATION, {
    // `kind` must match ^[a-z0-9][a-z0-9-]{0,63}$ — "menu_scan" is rejected.
    input: { kind: "menu-scan", contentType: "image/png" },
  });
  const target = data.createUploadTarget;
  expect(target.__typename, JSON.stringify(target)).toBe("UploadTarget");

  expect(
    target.uploadUrl,
    "the presigned PUT is signed for the compose-internal MinIO host again — a browser cannot dial that, so E3 has regressed",
  ).not.toContain("minio:9000");

  await primary.goto("/map/scans");
  await settleNetwork(primary);

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
        // A CSP refusal and a DNS failure both land here, and the message is
        // the only thing that distinguishes them.
        return {
          status: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    [target.uploadUrl, PIXEL_PNG_BASE64] as const,
  );

  expect(
    put,
    `the browser could not PUT to ${new URL(target.uploadUrl).origin}. Either the CSP does not permit that origin (NEXT_PUBLIC_FILE_ORIGINS / connect-src, baked at build time) or the signer is using an authority this machine cannot dial`,
  ).toEqual({ status: 200, error: null });

  // `createMenuScan` verifies the upload itself, so this succeeding is also
  // the proof that the bytes really landed in the bucket.
  const created = await api.query(CREATE_SCAN_MUTATION, {
    input: { originalImageId: target.fileId },
  });
  const scan = created.createMenuScan;
  expect(scan.__typename, JSON.stringify(scan)).toBe("MenuScan");
  scanId = scan.id;
});

/**
 * `createMenuScan` refuses a file whose upload never happened (E2d).
 *
 * This test used to assert the opposite, and said so: the scan was created
 * against an empty file and only failed three outbox hops later, leaving a junk
 * row behind. The schema always intended otherwise — `files.verified_at`,
 * `verifyUpload(fileId:)` and the `files_unverified_idx` partial index over
 * exactly the rows that never got any — and none of it was consulted.
 * `MenuScanActor.create` now asks `FileActor.verify`, which asks the object
 * store; the refusal is a `ConflictError` naming the file.
 *
 * It mints its **own** target and deliberately uploads nothing, rather than
 * reusing the one above. Since E3 the test above really does upload, so a
 * shared id would now be verified and this rule would silently stop being
 * exercised — a test that passes for the wrong reason is the failure mode this
 * file already has history with.
 */
test("createMenuScan refuses a file that was never uploaded", async ({
  api,
}) => {
  const minted = await api.query(UPLOAD_TARGET_MUTATION, {
    input: { kind: "menu-scan", contentType: "image/png" },
  });
  const target = minted.createUploadTarget;
  expect(target.__typename, JSON.stringify(target)).toBe("UploadTarget");

  const data = await api.query(CREATE_SCAN_MUTATION, {
    input: { originalImageId: target.fileId },
  });
  const scan = data.createMenuScan;
  expect(
    scan.__typename,
    `createMenuScan accepted an unverified file again: ${JSON.stringify(scan)}`,
  ).toBe("ConflictError");
  expect(scan.message).toContain(target.fileId);
});

/**
 * A 1×1 pixel is not a menu, and the pipeline must not pretend otherwise.
 *
 * This asserted `failed` while the only file a scan could be made from was one
 * with **no bytes at all** — which E2d then made impossible, since
 * `createMenuScan` verifies the upload. The scan now has a real (tiny) image,
 * so both endings are legitimate: the vision model can refuse it (`failed`) or
 * come back with nothing (`completed` with `itemsDetected: 0`). What must never
 * happen is items appearing out of a single pixel, and that is what this
 * checks.
 *
 * ## When it skips, and why that is not a pass
 *
 * The question is about the **model**, so it can only be asked when the vision
 * seam actually ran. Two states of the machine stop it from running, and both
 * used to surface here as a red that said nothing about the code:
 *
 * - **no reachable provider** — Ollama not running on the host, say: a
 *   transport failure, classed `CONFLICT` and retried by the outbox.
 * - **a spent budget** — `ai_model/menu_extraction` is capped per account
 *   (60/day, `USER_CAPS` in `budget-actor.ts`) and every agent's runs share
 *   `test@test.com`. A refusal is *not* permanent, so the outbox retries it
 *   on a ~17-minute ladder while the scan stays `processing` with the refusal
 *   in `processingError` (`MenuScanActor.process`).
 *
 * The viewer never sees the stored error itself: `MenuScan.processingError`
 * is one sentence per failure class (`services/api/src/schema/failure-summary.ts`),
 * so the two cases are recognised by those sentences — `BUDGET_EXCEEDED`'s and
 * `CONFLICT`'s. A `CONFLICT` covers any transient failure (5xx, 429, timeout,
 * unreachable), and in every one of them the model gave no answer to judge.
 * `VALIDATION` (the image was rejected) *is* an answer, and passes as `failed`.
 *
 * That retry ladder is also why the old poll was wrong, not just unlucky: it
 * waited for "not `pending`", accepted `processing`, and then asserted a
 * terminal state — a race it won only when the pipeline failed fast. This now
 * waits for a terminal state **or** an attempt that has already failed, and
 * reads the failure before judging anything.
 */
/** `failure-summary.ts`, `BUDGET_EXCEEDED`. */
const BUDGET_SPENT = /allowance for AI processing is used up/i;
/** `failure-summary.ts`, `CONFLICT`. */
const NOT_ANSWERED = /did not complete and is being retried/i;

test("a scan of a 1×1 pixel does not invent a menu", async ({ api }) => {
  test.skip(scanId === null, SCAN_SKIP_REASON);
  // The vision call itself is bounded by AI_REQUEST_TIMEOUT_MS (120s in the
  // compose file); the poll has to outlast one attempt of it.
  test.setTimeout(180_000);

  type Scan = {
    processingStatus: string;
    itemsDetected: number;
    processingError: string | null;
  };
  const read = async (): Promise<Scan> =>
    (
      await api.query(
        `query S($id: ID!) { menuScan(id: $id) {
           __typename
           ... on MenuScan { processingStatus itemsDetected processingError }
         } }`,
        { id: scanId },
      )
    ).menuScan;

  let scan: Scan = await read();
  await expect
    .poll(
      async () => {
        scan = await read();
        return (
          scan.processingStatus === "failed" ||
          scan.processingStatus === "completed" ||
          (scan.processingStatus === "processing" &&
            (scan.processingError ?? "") !== "")
        );
      },
      {
        message:
          "the scan never finished an attempt: still `pending`, or `processing` with no error, after 150s",
        timeout: 150_000,
      },
    )
    .toBe(true);

  const error = scan.processingError ?? "";
  test.skip(
    BUDGET_SPENT.test(error),
    `the shared test account's menu_extraction budget is spent, so the vision model was never asked. Server said: ${error}`,
  );
  test.skip(
    NOT_ANSWERED.test(error),
    `the vision model gave no answer (provider unreachable or erroring — is Ollama running? \`ollama serve\`, \`ollama pull gemma3:4b\`). Server said: ${error}`,
  );

  expect(
    ["failed", "completed"],
    `a scan ended in an unexpected state: ${JSON.stringify(scan)}`,
  ).toContain(scan.processingStatus);
  if (scan.processingStatus === "completed") {
    expect(
      scan.itemsDetected,
      "the extractor read menu items off a single pixel",
    ).toBe(0);
  }
});

/**
 * The ownership rule, exercised against a scan that really exists.
 *
 * The previous draft looked for an existing scan and skipped when the table was
 * empty — which it always was, so this rule had never actually been checked.
 */
test("a scan id is not an oracle for a stranger", async ({ api2 }) => {
  test.skip(scanId === null, SCAN_SKIP_REASON);

  const theirs = await api2.query(
    `query S($id: ID!) { menuScan(id: $id) {
       __typename ... on Error { message }
     } }`,
    { id: scanId },
  );
  expect(
    theirs.menuScan.__typename,
    "another account read a menu scan that is not theirs",
  ).toBe("NotFoundError");
});

test("my scans list includes the scan I just made", async ({ api }) => {
  test.skip(scanId === null, SCAN_SKIP_REASON);
  const data = await api.query(
    `query { myMenuScans(first: 50) {
       __typename ... on MenuScanConnection { edges { node { id } } }
     } }`,
  );
  const conn = data.myMenuScans;
  expect(conn.__typename, JSON.stringify(conn)).toBe("MenuScanConnection");
  expect(
    conn.edges.map((e: any) => e.node.id),
    "myMenuScans does not list a scan this account just created",
  ).toContain(scanId);
});

test("the scans list renders", async ({ primary }) => {
  const noise = watch(primary);
  await primary.goto("/map/scans");
  await settleNetwork(primary);
  expect(noise.pageErrors, "/map/scans threw").toEqual([]);
  expect((await bodyText(primary)).length).toBeGreaterThan(0);
});

test("the discoveries page renders", async ({ primary }) => {
  const noise = watch(primary);
  await primary.goto("/discoveries");
  await settleNetwork(primary);
  expect(noise.pageErrors, "/discoveries threw").toEqual([]);
});
