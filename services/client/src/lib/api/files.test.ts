/**
 * The upload flow, exercised through a real URQL client (D10).
 *
 * The client is real — `createClient` with `fetchExchange` and a stubbed
 * `fetch` — rather than a hand-rolled mock, so these cases run the actual
 * document, the actual variables and the actual result-union unwrapping. A
 * mock shaped like whatever the code happens to call would pass even if the
 * document were wrong; `src/lib/dev-checks/upload-surface.test.ts` checks the
 * document against the schema for the same reason.
 *
 *   bun run test:unit
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient, fetchExchange } from "urql";
import {
  describeUploadBlockers,
  permittedFileOrigins,
  putToUploadTarget,
  requestUploadTarget,
  UploadRejectedError,
  type UploadTarget,
  UploadUnavailableError,
  uploadFile,
  verifyUploadedFile,
} from "./files.ts";

const FILE_ID = "918cfced-40b7-4ba3-aa97-10b0f5aee608";
const SIGNED = "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=deadbeef";

/** A shape matching the one a live `createUploadTarget` returned, verbatim. */
const targetPayload = (origin: string) => ({
  __typename: "UploadTarget",
  fileId: FILE_ID,
  bucket: "cellar-files",
  key: `item-image/${FILE_ID}`,
  uploadUrl: `${origin}/cellar-files/item-image/${FILE_ID}${SIGNED}`,
  expiresAt: "2026-09-10T22:28:13.832Z",
});

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

/** A client whose every operation answers `payload`, recording what was sent. */
const clientFor = (payload: unknown) => {
  const sent: { query: string; variables: Record<string, unknown> }[] = [];
  const client = createClient({
    url: "http://api.test/graphql",
    exchanges: [fetchExchange],
    fetch: (async (_input: unknown, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)));
      return json(payload);
    }) as unknown as typeof fetch,
  });
  return { client, sent };
};

/* ---------------------------------------------------------------- blockers */

test("no blockers when the build recorded a file origin", () => {
  assert.deepEqual(describeUploadBlockers(["https://files.example.com"]), []);
});

test("no blockers when the build recorded nothing at all", () => {
  // `null` is "not a Next build" — a unit test, a script. Claiming a blocker
  // here is exactly the kind of confident-and-wrong this module used to do.
  assert.deepEqual(describeUploadBlockers(null), []);
});

test("an empty allowlist is a real blocker, and names the variable to set", () => {
  const blockers = describeUploadBlockers([]);
  assert.equal(blockers.length, 1);
  assert.match(blockers[0] ?? "", /PUBLIC_FILES_HOST/);
});

test("permittedFileOrigins distinguishes unset from set-and-empty", () => {
  assert.equal(permittedFileOrigins(undefined), null);
  assert.deepEqual(permittedFileOrigins(""), []);
  assert.deepEqual(
    permittedFileOrigins("http://localhost:9100 http://a.test"),
    ["http://localhost:9100", "http://a.test"],
  );
});

/* ------------------------------------------------------- requestUploadTarget */

test("requestUploadTarget sends kind and contentType and returns the target", async () => {
  const { client, sent } = clientFor({
    data: { createUploadTarget: targetPayload("https://files.example.com") },
  });
  process.env.NEXT_PUBLIC_FILE_ORIGINS = "https://files.example.com";
  try {
    const target = await requestUploadTarget(client, {
      kind: "item-image",
      contentType: "image/png",
    });
    assert.equal(target.fileId, FILE_ID);
    assert.equal(target.bucket, "cellar-files");
    assert.match(target.uploadUrl, /^https:\/\/files\.example\.com\//);

    assert.deepEqual(sent[0]?.variables, {
      fileId: null,
      input: { kind: "item-image", contentType: "image/png" },
    });
    assert.match(String(sent[0]?.query), /createUploadTarget/);
  } finally {
    delete process.env.NEXT_PUBLIC_FILE_ORIGINS;
  }
});

test("a URL signed for an origin this build may not contact is refused before any bytes move", async () => {
  // The default development stack: `services/actors` has no FILES_S3_ENDPOINT, so
  // it signs the compose-internal host. Verified live, 2026-09-10 — and
  // rewriting the host to the published port answers SignatureDoesNotMatch,
  // which is why this is a refusal and not a rewrite.
  const { client } = clientFor({
    data: { createUploadTarget: targetPayload("http://minio:9000") },
  });
  process.env.NEXT_PUBLIC_FILE_ORIGINS = "http://localhost:9100";
  try {
    await assert.rejects(
      requestUploadTarget(client, { kind: "item-image" }),
      (error: unknown) => {
        assert.ok(error instanceof UploadUnavailableError);
        assert.match(error.message, /http:\/\/minio:9000/);
        assert.match(error.message, /http:\/\/localhost:9100/);
        assert.match(error.message, /FILES_S3_ENDPOINT/);
        return true;
      },
    );
  } finally {
    delete process.env.NEXT_PUBLIC_FILE_ORIGINS;
  }
});

test("a typed API error comes out as UploadRejectedError, not a string", async () => {
  const { client } = clientFor({
    data: {
      createUploadTarget: {
        __typename: "ConflictError",
        code: "CONFLICT",
        message: `file ${FILE_ID} already has a row`,
      },
    },
  });
  await assert.rejects(
    requestUploadTarget(client, { kind: "item-image", fileId: FILE_ID }),
    (error: unknown) => {
      assert.ok(error instanceof UploadRejectedError);
      assert.equal(error.failure.code, "CONFLICT");
      return true;
    },
  );
});

/* -------------------------------------------------------- putToUploadTarget */

const target: UploadTarget = {
  ...targetPayload("https://files.example.com"),
};

test("the PUT sends the bytes, the declared content type and no credentials", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(null, { status: 200 });
  }) as unknown as typeof fetch;
  try {
    await putToUploadTarget(target, new Blob(["x"], { type: "image/png" }));
  } finally {
    globalThis.fetch = original;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, target.uploadUrl);
  assert.equal(calls[0]?.init.method, "PUT");
  // Anything beyond the signed Content-Type breaks the signature; a cookie
  // would only confuse S3.
  assert.deepEqual(calls[0]?.init.headers, { "content-type": "image/png" });
  assert.equal(calls[0]?.init.credentials, "omit");
});

test("the PUT adds no header beyond the signed set and content-type, and never an x-amz-* one", async () => {
  // The object store (pgsty/silo, like the Chainguard MinIO fork, since
  // 2026-09) rejects a presigned request that carries any `x-amz-*` header
  // which is not in `X-Amz-SignedHeaders`: 403 AccessDenied, "There were
  // headers present in the request which were not signed". Measured against
  // the pinned image. The signer signs `host` alone, which the browser
  // supplies, so the only header this code may add is `content-type`. That
  // header is unsigned, and S3 accepts it unsigned because it is not
  // `x-amz-*`. A future `x-amz-meta-*`, `x-amz-acl` or checksum header here
  // would turn every browser upload into a 403.
  const presigned = new URL(
    `https://files.example.com/cellar-files/uploads/item-image/${FILE_ID}` +
      "?X-Amz-Algorithm=AWS4-HMAC-SHA256" +
      "&X-Amz-Credential=cellar%2F20261004%2Fus-east-1%2Fs3%2Faws4_request" +
      "&X-Amz-Date=20261004T120000Z&X-Amz-Expires=900" +
      "&X-Amz-SignedHeaders=host&X-Amz-Signature=deadbeef",
  );
  const signed = new Set(
    (presigned.searchParams.get("X-Amz-SignedHeaders") ?? "").split(";"),
  );
  const allowedUnsigned = new Set(["content-type"]);

  for (const type of ["image/png", "image/heic", "application/pdf", ""]) {
    const sent: Headers[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      sent.push(new Headers(init.headers));
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    try {
      await putToUploadTarget(
        { ...target, uploadUrl: presigned.toString() },
        new Blob(["x"], { type }),
      );
    } finally {
      globalThis.fetch = original;
    }

    assert.equal(sent.length, 1);
    const names = [...(sent[0]?.keys() ?? [])];
    for (const name of names) {
      assert.ok(
        !name.startsWith("x-amz-"),
        `blob type ${JSON.stringify(type)}: unsigned ${name} would be rejected`,
      );
      assert.ok(
        signed.has(name) || allowedUnsigned.has(name),
        `blob type ${JSON.stringify(type)}: ${name} is neither signed nor content-type`,
      );
    }
    assert.deepEqual(names, type === "" ? [] : ["content-type"]);
  }
});

test("a rejected PUT says the URL may have expired rather than swallowing the status", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("SignatureDoesNotMatch", {
      status: 403,
    })) as unknown as typeof fetch;
  try {
    await assert.rejects(
      putToUploadTarget(target, new Blob(["x"], { type: "image/png" })),
      /403/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

/* -------------------------------------------------------------- verify + all */

test("verifyUploadedFile reads verifiedAt back off the File", async () => {
  const { client, sent } = clientFor({
    data: {
      verifyUpload: {
        __typename: "File",
        id: FILE_ID,
        bucket: "cellar-files",
        key: `item-image/${FILE_ID}`,
        size: 1,
        mimeType: "image/png",
        verifiedAt: "2026-09-10T22:20:00.000Z",
      },
    },
  });
  const file = await verifyUploadedFile(client, FILE_ID);
  assert.equal(file.verifiedAt, "2026-09-10T22:20:00.000Z");
  assert.deepEqual(sent[0]?.variables, { fileId: FILE_ID });
});

test("an unverified file is a ConflictError, surfaced as a typed rejection", async () => {
  const { client } = clientFor({
    data: {
      verifyUpload: {
        __typename: "ConflictError",
        code: "CONFLICT",
        message: `file ${FILE_ID} is not verified yet`,
      },
    },
  });
  await assert.rejects(
    verifyUploadedFile(client, FILE_ID),
    (error: unknown) => error instanceof UploadRejectedError,
  );
});

test("uploadFile runs create then PUT, and only verifies when asked", async () => {
  const { client, sent } = clientFor({
    data: {
      createUploadTarget: targetPayload("https://files.example.com"),
      verifyUpload: null,
    },
  });
  const puts: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    puts.push(url);
    return new Response(null, { status: 200 });
  }) as unknown as typeof fetch;
  try {
    const fileId = await uploadFile(
      client,
      new Blob(["x"], { type: "image/png" }),
      "item-image",
    );
    assert.equal(fileId, FILE_ID);
  } finally {
    globalThis.fetch = original;
  }

  assert.equal(puts.length, 1, "the bytes went straight at the presigned URL");
  assert.equal(
    sent.length,
    1,
    "attachItemImage verifies for us; a second round trip here buys nothing",
  );
});
