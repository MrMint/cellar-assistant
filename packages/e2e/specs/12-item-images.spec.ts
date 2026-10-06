import { crc32, deflateSync } from "node:zlib";
import type { Page } from "@playwright/test";
import { unique } from "../fixtures/data.ts";
import { expect, settleNetwork, test } from "../fixtures/test.ts";

/**
 * Item photos are cacheable again (2026-10-06).
 *
 * Production measured two things: `FileActor.presignRead` signed a different
 * URL on every page load, so the browser cache never hit, and the restored UI
 * rendered presigned originals into plain `<img>`s, so a 400 px card
 * downloaded up to 4.6 MB. This asserts both fixes end to end, against the
 * real actor host, MinIO and Next optimizer:
 *
 *   1. the item page asks `/_next/image` for the photo, and gets WebP back;
 *   2. the presigned URL inside it is the same string on a second load
 *      (one URL per object per window — `services/actors/src/lib/s3-presign.ts`,
 *      "Stable read URLs");
 *   3. MinIO serves that URL with the signed `Cache-Control`.
 *
 * On the `cellar-stack` lane the optimizer runs in the client container and
 * reaches `localhost:9100` through `client-files-loopback`
 * (`infra/docker-compose.yml`). A tea, as in 11, because `createItem` can write
 * one without the onboarding flow; items have no delete, so it outlives the run.
 */
test.describe.configure({ mode: "serial" });

/** A 64×64 RGB PNG, so the optimizer has something to resize and transcode. */
const pngBytes = (): Uint8Array<ArrayBuffer> => {
  const size = 64;
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 3); // filter byte 0, then pixels
    for (let x = 0; x < size; x += 1) {
      row[1 + x * 3] = x * 4;
      row[2 + x * 3] = y * 4;
      row[3 + x * 3] = 128;
    }
    rows.push(row);
  }
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(Buffer.concat(rows))),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
};

let teaId: string;

test("fixtures: a tea with an uploaded photo", async ({ api }) => {
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
      input: { name: unique("E2 Photo Tea"), tea: { category } },
    },
  );
  expect(
    created.createItem.__typename,
    JSON.stringify(created.createItem),
  ).toBe("MutationCreateItemSuccess");
  teaId = created.createItem.data.id;

  const minted = await api.query(
    `mutation U($input: CreateUploadTargetInput!) {
       createUploadTarget(input: $input) {
         __typename
         ... on UploadTarget { fileId uploadUrl }
         ... on Error { message }
       }
     }`,
    { input: { kind: "item-image", contentType: "image/png" } },
  );
  const target = minted.createUploadTarget;
  expect(target.__typename, JSON.stringify(target)).toBe("UploadTarget");

  const put = await fetch(target.uploadUrl, {
    method: "PUT",
    body: pngBytes(),
    headers: { "content-type": "image/png" },
  });
  expect(put.status, await put.text()).toBe(200);

  const attached = await api.query(
    `mutation A($itemId: ID!, $input: AttachItemImageInput!) {
       attachItemImage(itemId: $itemId, type: TEA, input: $input) {
         __typename
         ... on ItemImage { id }
         ... on Error { message }
       }
     }`,
    { itemId: teaId, input: { fileId: target.fileId, isPublic: true } },
  );
  expect(
    attached.attachItemImage.__typename,
    JSON.stringify(attached.attachItemImage),
  ).toBe("ItemImage");
});

/** The presigned source URL inside the item photo's `/_next/image` request. */
const photoSource = async (
  page: Page,
): Promise<{ optimized: string; source: string }> => {
  const photo = page.locator(
    'img[alt="A picture of a glass"][src*="/_next/image"]',
  );
  await expect(photo).toBeVisible();
  const src = await photo.getAttribute("src");
  expect(src).toBeTruthy();
  const optimized = new URL(src ?? "", page.url()).toString();
  const source = new URL(optimized).searchParams.get("url") ?? "";
  return { optimized, source };
};

test("the item photo is served by /_next/image as WebP, from a stable presigned URL", async ({
  primary,
}) => {
  const optimizerResponses: { status: number; type: string | null }[] = [];
  primary.on("response", (response) => {
    if (response.url().includes("/_next/image?")) {
      optimizerResponses.push({
        status: response.status(),
        type: response.headers()["content-type"] ?? null,
      });
    }
  });

  await primary.goto(`/teas/${teaId}`);
  await settleNetwork(primary);
  const first = await photoSource(primary);

  // The source is the presigned MinIO URL, not the original bytes in the page.
  expect(first.source).toContain("X-Amz-Signature=");
  expect(first.source).toContain("response-cache-control=");

  // The optimizer answered the browser with WebP (formats: ["image/webp"]).
  await expect
    .poll(() => optimizerResponses.length, { timeout: 15_000 })
    .toBeGreaterThan(0);
  expect(optimizerResponses[0]).toEqual({ status: 200, type: "image/webp" });

  // And a second load inside the window hands out the identical URL — which is
  // what lets the browser and the optimizer cache it at all.
  await primary.reload();
  await settleNetwork(primary);
  const second = await photoSource(primary);
  expect(second.source).toBe(first.source);

  // MinIO honours the signed response-cache-control override.
  const direct = await fetch(first.source);
  expect(direct.status).toBe(200);
  expect(direct.headers.get("cache-control")).toMatch(
    /^private, max-age=\d+, immutable$/,
  );
});
