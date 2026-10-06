/**
 * Test-only: a stand-in for Nhost's Storage API (hasura-storage), implementing
 * exactly the `GET`/`HEAD /v1/files/{id}` semantics `migrate-files-core.ts`
 * cites from `nhost/nhost@storage@0.15.0`:
 *
 * - the admin secret travels as `x-hasura-admin-secret`; a wrong one is Hasura's
 *   `access-denied` → 403 with `X-Error: you are not authorized`;
 * - an unknown id is 404 `X-Error: file not found`;
 * - `GET` 200 streams the body with `Content-Type`, `Etag` (the metadata etag),
 *   `Content-Length` (the object's length) and `Accept-Ranges: bytes`;
 * - `HEAD` 200 answers from metadata: `Content-Length` = the metadata size;
 * - a row whose object is gone is a 500 `an internal server error occurred`.
 *
 * Per-file behaviours script the failure modes: 429s before a 200, a declared
 * length that disagrees with the metadata, a body that stalls or crawls, a
 * redirect elsewhere, and a hold that parks the response until released.
 */
import { createHash } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

export type StubFile = {
  body: Buffer;
  mimeType?: string;
  /** Size the metadata (HEAD) reports; defaults to body length. */
  metadataSize?: number;
  /** Content-Length a GET declares; defaults to body length. */
  declaredLength?: number;
  /** Answer this many GETs with 429 (and `Retry-After`) first. */
  throttle?: number;
  retryAfter?: string;
  /** Answer every GET with this status instead (e.g. 500: object gone). */
  status?: number;
  xError?: string;
  /** Write the body in chunks of this size, pausing `chunkDelayMs` between. */
  chunkBytes?: number;
  chunkDelayMs?: number;
  /** On the first GET, send this many bytes and then nothing, ever. */
  stallFirstAfterBytes?: number;
  /** 302 to this URL. */
  redirectTo?: string;
  /** GETs wait on this before answering. */
  hold?: Promise<void>;
};

export type Stub = {
  url: string;
  files: Map<string, StubFile>;
  gets: Map<string, number>;
  heads: number;
  maxInFlight: number;
  /** Every distinct secret presented, to prove the real one was sent. */
  secretsSeen: Set<string>;
  close(): Promise<void>;
};

export const md5Etag = (body: Buffer): string =>
  `"${createHash("md5").update(body).digest("hex")}"`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** `host` is where it listens; `0.0.0.0` lets a container reach it too. */
export const startStub = async (
  secret: string,
  host = "127.0.0.1",
): Promise<Stub> => {
  const files = new Map<string, StubFile>();
  const gets = new Map<string, number>();
  const secretsSeen = new Set<string>();
  const sockets = new Set<import("node:net").Socket>();
  let inFlight = 0;
  const stub: Stub = {
    url: "",
    files,
    gets,
    heads: 0,
    maxInFlight: 0,
    secretsSeen,
    close: async () => {
      for (const s of sockets) s.destroy();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };

  const fail = (res: ServerResponse, status: number, message: string) => {
    res.writeHead(status, {
      "content-type": "application/json",
      "x-error": message,
    });
    res.end(JSON.stringify({ error: { message } }));
  };

  const handle = async (
    req: IncomingMessage,
    res: ServerResponse,
    done: () => void,
  ) => {
    if (req.method === "HEAD") stub.heads += 1;
    const presented = req.headers["x-hasura-admin-secret"];
    if (typeof presented === "string") secretsSeen.add(presented);
    const match = /^\/v1\/files\/([^/?]+)$/.exec(req.url ?? "");
    if (match === null || (req.method !== "GET" && req.method !== "HEAD")) {
      return fail(res, 404, "not found");
    }
    if (presented !== secret) {
      return fail(res, 403, "you are not authorized");
    }
    const id = decodeURIComponent(match[1] ?? "");
    const file = files.get(id);
    if (file === undefined) return fail(res, 404, "file not found");

    if (req.method === "HEAD") {
      res.writeHead(200, {
        "content-length": String(file.metadataSize ?? file.body.length),
        "content-type": file.mimeType ?? "application/octet-stream",
        etag: md5Etag(file.body),
      });
      return res.end();
    }

    const n = (gets.get(id) ?? 0) + 1;
    gets.set(id, n);
    if (file.hold !== undefined) await file.hold;
    if (file.redirectTo !== undefined) {
      res.writeHead(302, { location: file.redirectTo });
      return res.end();
    }
    if (file.throttle !== undefined && n <= file.throttle) {
      res.setHeader("retry-after", file.retryAfter ?? "0");
      return fail(res, 429, "too many requests");
    }
    if (file.status !== undefined) {
      return fail(
        res,
        file.status,
        file.xError ?? "an internal server error occurred",
      );
    }
    res.writeHead(200, {
      "content-type": file.mimeType ?? "application/octet-stream",
      "content-length": String(file.declaredLength ?? file.body.length),
      etag: md5Etag(file.body),
      "accept-ranges": "bytes",
    });
    if (n === 1 && file.stallFirstAfterBytes !== undefined) {
      res.write(file.body.subarray(0, file.stallFirstAfterBytes));
      return; // never ends; the client's stall timer has to notice
    }
    const size = file.chunkBytes ?? file.body.length;
    for (let off = 0; off < file.body.length; off += size) {
      if (off > 0 && file.chunkDelayMs !== undefined) {
        await sleep(file.chunkDelayMs);
      }
      if (res.destroyed) return;
      const last = off + size >= file.body.length;
      if (last) done();
      const ok = res.write(file.body.subarray(off, off + size));
      if (!ok && !last) await new Promise((r) => res.once("drain", r));
    }
    res.end();
  };

  // In flight = a GET between arriving and its last byte being written. Not
  // "until the socket closes": a client that has read Content-Length bytes
  // is done with the request, and may start the next one, before that.
  const server: Server = createServer((req, res) => {
    const counts = req.method === "GET";
    if (counts) {
      inFlight += 1;
      stub.maxInFlight = Math.max(stub.maxInFlight, inFlight);
    }
    let open = counts;
    const done = () => {
      if (open) {
        open = false;
        inFlight -= 1;
      }
    };
    res.on("close", done);
    handle(req, res, done).catch(() => res.destroy());
  });
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise<void>((r) => server.listen(0, host, () => r()));
  const { port } = server.address() as AddressInfo;
  stub.url = `http://127.0.0.1:${String(port)}/v1`;
  return stub;
};
