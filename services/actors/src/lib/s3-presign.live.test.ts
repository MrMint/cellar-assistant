/**
 * `setObjectMediaType`'s copy-away against a **real MinIO** — the half of
 * W4 security F5's fix that `file-actor.test.ts` can only model.
 *
 * `FileActor.verify` now publishes an upload by copying it from the key its
 * presigned PUT signs to the key reads sign, stamping the detected type and
 * `attachment` on the way, and only while the upload still carries the ETag
 * that was checked. Three store behaviours make that safe, and all three are
 * MinIO's, not this repo's, so they are measured here rather than assumed:
 *
 *   1. a copy with `into` writes the other key, with the new headers, and
 *      leaves the bytes alone;
 *   2. a second PUT to the same presigned URL, after the copy, changes the
 *      upload key and nothing else;
 *   3. a copy whose `ifMatch` is stale is refused with `PreconditionFailed`
 *      (the code `files-binding.ts` turns into `ObjectChangedError`) and
 *      writes nothing.
 *
 * It skips itself unless the shared compose stack's MinIO answers on
 * `localhost:9100` (`bun run stack:up`), the same reachability gate
 * `ai/ollama.live.test.ts` uses — a closed local port, so a CI runner skips
 * fast. Every object it writes is under a per-run prefix and removed after.
 * Point it elsewhere with `FILES_S3_LIVE_ENDPOINT` / `FILES_S3_LIVE_PORT`.
 */
import { randomUUID } from "node:crypto";
import { Client as MinioClient } from "minio";
import { afterAll, describe, expect, it } from "vitest";
import {
  filesS3Config,
  presignedGetUrl,
  presignedPutUrl,
  setObjectMediaType,
} from "./s3-presign.ts";

const HOST = process.env.FILES_S3_LIVE_ENDPOINT ?? "localhost";
const PORT = process.env.FILES_S3_LIVE_PORT ?? "9100";

const config = filesS3Config({
  FILES_S3_ENDPOINT: HOST,
  FILES_S3_PORT: PORT,
  MINIO_ROOT_USER: process.env.MINIO_ROOT_USER,
  MINIO_ROOT_PASSWORD: process.env.MINIO_ROOT_PASSWORD,
});

const reachable = async (): Promise<boolean> => {
  try {
    const response = await fetch(`http://${HOST}:${PORT}/minio/health/live`, {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    // Not reachable is not a failure — this suite needs the stack up.
    return false;
  }
};

const skip = !(await reachable());

const client = new MinioClient({
  endPoint: config.endPoint,
  port: config.port,
  useSSL: config.useSSL,
  region: config.region,
  accessKey: config.accessKey,
  secretKey: config.secretKey,
});

const prefix = `w5-live-test/${randomUUID()}`;

/** A JPEG signature and some bytes after it, and an HTML document. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]);
const HTML = new TextEncoder().encode("<html><script>alert(1)</script>");

const put = async (url: string, body: Uint8Array, contentType: string) => {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "content-type": contentType },
    body,
  });
  expect(response.status).toBe(200);
};

const read = async (key: string) => {
  const response = await fetch(await presignedGetUrl(config, key, 60));
  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    disposition: response.headers.get("content-disposition"),
    bytes: new Uint8Array(await response.arrayBuffer()),
  };
};

describe.skipIf(skip)("setObjectMediaType against MinIO (W4 F5)", () => {
  afterAll(async () => {
    const names: string[] = [];
    for await (const item of client.listObjectsV2(
      config.bucket,
      prefix,
      true,
    )) {
      if (item.name !== undefined) names.push(item.name);
    }
    if (names.length > 0) await client.removeObjects(config.bucket, names);
  });

  it("publishes an upload to another key, and a later PUT cannot reach it", async () => {
    const key = `${prefix}/item-image/${randomUUID()}`;
    const uploadKey = `${prefix}/uploads/item-image/${randomUUID()}`;
    const uploadUrl = await presignedPutUrl(config, uploadKey, 300);

    await put(uploadUrl, JPEG, "text/html");
    const { etag } = await client.statObject(config.bucket, uploadKey);
    await setObjectMediaType(config, uploadKey, "image/jpeg", {
      into: key,
      ifMatch: etag,
    });

    const published = await read(key);
    expect(published.status).toBe(200);
    expect(published.contentType).toBe("image/jpeg");
    expect(published.disposition).toBe("attachment");
    expect(published.bytes).toEqual(JPEG);
    // The copy leaves the ETag alone: it is the content's MD5.
    expect((await client.statObject(config.bucket, key)).etag).toBe(etag);

    // The attack: the same URL, still valid, HTML this time.
    await put(uploadUrl, HTML, "text/html");
    const after = await read(key);
    expect(after.bytes).toEqual(JPEG);
    expect(after.contentType).toBe("image/jpeg");
    expect(after.disposition).toBe("attachment");
    // …it landed on the upload key, which nothing signs a read for.
    expect((await read(uploadKey)).bytes).toEqual(HTML);
  });

  it("refuses a copy whose source changed since it was checked", async () => {
    const key = `${prefix}/item-image/${randomUUID()}`;
    const uploadKey = `${prefix}/uploads/item-image/${randomUUID()}`;
    const uploadUrl = await presignedPutUrl(config, uploadKey, 300);

    await put(uploadUrl, JPEG, "image/jpeg");
    const { etag: checked } = await client.statObject(config.bucket, uploadKey);
    await put(uploadUrl, HTML, "text/html");

    await expect(
      setObjectMediaType(config, uploadKey, "image/jpeg", {
        into: key,
        ifMatch: checked,
      }),
    ).rejects.toMatchObject({ code: "PreconditionFailed" });
    expect((await read(key)).status).toBe(404);
  });
});
