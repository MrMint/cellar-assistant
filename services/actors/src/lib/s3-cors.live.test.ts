/**
 * The object store's CORS, measured against a real one: the shared compose
 * stack's `minio` service (pgsty/silo).
 *
 * The browser PUTs an upload straight to a presigned URL, cross-origin, with
 * a `content-type` header, so the browser sends a preflight first
 * (`putToUploadTarget`, services/client/src/lib/api/files.ts). Nothing in
 * this repo used to configure CORS. Uploads worked only because MinIO's
 * default, which silo keeps, reflects ANY Origin, with
 * `Access-Control-Allow-Credentials: true`. Measured against the pinned silo
 * image with nothing configured: `Origin: https://evil.example` came back as
 * `Access-Control-Allow-Origin: https://evil.example`.
 *
 * `infra/docker-compose.yml` now sets CORS explicitly from
 * `FILES_CORS_ALLOWED_ORIGINS`. `minio` gets it as the server-wide
 * `MINIO_API_CORS_ALLOW_ORIGIN`, and `minio-init` writes it as the bucket's
 * CORS rule (PUT and GET, header `content-type`). This file pins both halves
 * of that: the app's origins get a preflight that lets the upload through,
 * and any other origin gets none.
 *
 * It also pins the store behaviour the client test in files.test.ts depends
 * on: an unsigned `x-amz-*` header on a presigned PUT is refused.
 *
 * It skips itself unless the store answers on `localhost:9100`
 * (`bun run stack:up`), the same gate `s3-presign.live.test.ts` uses.
 * `FILES_S3_LIVE_REQUIRED=1` (the services/actors CI leg) turns a skip into a
 * failure. The origins it expects default to the base compose file's
 * `http://localhost:3000,http://localhost:3003`. Point it at another lane with
 * `FILES_S3_LIVE_CORS_ORIGINS` (for the per-worktree lane, the
 * `FILES_CORS_ALLOWED_ORIGINS` that `bun run dev:env` prints) and
 * `FILES_S3_LIVE_PORT`.
 */
import { randomUUID } from "node:crypto";
import { Client as MinioClient } from "minio";
import { afterAll, describe, expect, it } from "vitest";
import { filesS3Config, presignedPutUrl } from "./s3-presign.ts";

const HOST = process.env.FILES_S3_LIVE_ENDPOINT ?? "localhost";
const PORT = process.env.FILES_S3_LIVE_PORT ?? "9100";
const ALLOWED = (
  process.env.FILES_S3_LIVE_CORS_ORIGINS ??
  "http://localhost:3000,http://localhost:3003"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin !== "");
const FOREIGN = "https://evil.example";

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
    // Not reachable is not a failure unless FILES_S3_LIVE_REQUIRED says so.
    return false;
  }
};

const up = await reachable();
if (!up && process.env.FILES_S3_LIVE_REQUIRED === "1") {
  throw new Error(
    `FILES_S3_LIVE_REQUIRED=1 but no object store on ${HOST}:${PORT}`,
  );
}

const client = new MinioClient({
  endPoint: config.endPoint,
  port: config.port,
  useSSL: config.useSSL,
  region: config.region,
  accessKey: config.accessKey,
  secretKey: config.secretKey,
});

const prefix = `cors-live-test/${randomUUID()}`;

/** What a browser sends before `putToUploadTarget`'s PUT. */
const preflight = (url: string, origin: string) =>
  fetch(url, {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "PUT",
      "access-control-request-headers": "content-type",
    },
  });

describe.skipIf(!up)("object store CORS for the browser upload", () => {
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

  it("is configured for at least one origin", () => {
    expect(ALLOWED.length).toBeGreaterThan(0);
    expect(ALLOWED).not.toContain(FOREIGN);
  });

  it.each(ALLOWED)(
    "lets %s preflight and send the upload PUT",
    async (origin) => {
      const url = await presignedPutUrl(
        config,
        `${prefix}/uploads/item-image/${randomUUID()}`,
        300,
      );

      const options = await preflight(url, origin);
      expect(options.ok).toBe(true);
      expect(options.headers.get("access-control-allow-origin")).toBe(origin);
      expect(
        (
          options.headers.get("access-control-allow-methods") ?? ""
        ).toUpperCase(),
      ).toContain("PUT");
      expect(
        (
          options.headers.get("access-control-allow-headers") ?? ""
        ).toLowerCase(),
      ).toContain("content-type");

      // The PUT itself, with exactly the headers putToUploadTarget sends.
      const put = await fetch(url, {
        method: "PUT",
        headers: { origin, "content-type": "image/jpeg" },
        body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      });
      expect(put.status).toBe(200);
      expect(put.headers.get("access-control-allow-origin")).toBe(origin);
    },
  );

  it("gives a foreign origin no CORS grant on the preflight or the PUT", async () => {
    const url = await presignedPutUrl(
      config,
      `${prefix}/uploads/item-image/${randomUUID()}`,
      300,
    );

    // No reflected Origin and no wildcard. The status is 403 under the
    // bucket rule, but the missing header is what stops a browser, so that
    // is what this asserts.
    const options = await preflight(url, FOREIGN);
    expect(options.headers.get("access-control-allow-origin")).toBeNull();

    // A simple request skips the preflight. The store may still accept the
    // bytes, because the URL's signature is the authorisation, but the
    // response must not grant the foreign page read access to it.
    const put = await fetch(url, {
      method: "PUT",
      headers: { origin: FOREIGN, "content-type": "image/jpeg" },
      body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    });
    expect(put.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("refuses a presigned PUT that carries an unsigned x-amz-* header", async () => {
    const url = await presignedPutUrl(
      config,
      `${prefix}/uploads/item-image/${randomUUID()}`,
      300,
    );
    const put = await fetch(url, {
      method: "PUT",
      headers: { "content-type": "image/jpeg", "x-amz-meta-probe": "1" },
      body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    });
    // Measured: 400 with code AccessDenied. The status is the store's
    // business. That the PUT is refused, and why, is what the client relies on.
    expect(put.ok).toBe(false);
    const body = await put.text();
    expect(body).toContain("AccessDenied");
    expect(body).toContain("not signed");
  });
});
