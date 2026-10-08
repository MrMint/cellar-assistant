/**
 * Direct MinIO/S3 presigning for uploads (A8, target-stack §4).
 *
 * ## Why this exists instead of going through the `files` binding
 *
 * `infra/dapr/components/files-binding.yaml` is `bindings.aws.s3`. Verified
 * 2026-09-08 against `dapr/components-contrib`'s `bindings/aws/s3/s3.go`:
 * both the dedicated `presign` operation and `create`'s `presignTTL` option
 * call the AWS SDK's `PresignGetObject` unconditionally (`presignObject()` in
 * that file). There is no PUT-presign anywhere in the binding — `create`
 * without `presignTTL` uploads the body *through* the sidecar, which
 * target-stack §4 rules out ("image bytes never pass through the sidecar").
 * So the binding can hand back a read URL, never a write one; confirmed
 * empirically too (see `services/actors/scripts/a8-acceptance.sh`).
 *
 * `FileActor.createUploadTarget` needs a URL the *client* can PUT to, so it is
 * signed here, directly, against the same bucket and credentials
 * `files-binding.yaml` uses (that file's `bucket`/`endpoint`/`region` are
 * literal values, not env-templated — mirrored below as the defaults).
 * `FileActor.verify`, `.presignRead` and `.delete` still go through the
 * binding (`src/lib/files-binding.ts`) — this module is only for the one
 * operation the binding cannot do.
 *
 * Presigning an S3 request is pure HMAC computation: the `minio` client makes
 * no network call to produce a URL (confirmed empirically — signing against an
 * unresolvable host still returns instantly). So this needs no live MinIO to
 * unit test, and a GCS swap (target-stack §4) only means swapping this file's
 * signer, the same way `files-binding.yaml` would swap `bindings.aws.s3` for
 * `bindings.gcp.bucket` — `FileActor` itself does not change either way.
 *
 * ## E3: the signed host *is* the address the browser must use
 *
 * SigV4 puts the `Host` header inside the signature — every URL this module
 * produces carries `X-Amz-SignedHeaders=host`. Read straight out of the
 * `minio` client (8.0.7):
 *
 *   - `internal/client.js` `getRequestOptions()` sets
 *     `reqOptions.headers.host = host`, and appends `:port` **only** when the
 *     port is non-default for the scheme (`http:`+80, `https:`+443 are bare).
 *   - `signing.js` `presignSignatureV4()` returns
 *     `protocol + '//' + request.headers.host + path + …`.
 *
 * So the URL's authority and the signed authority are the same string by
 * construction. A proxy cannot rewrite it in flight, and an `/etc/hosts` alias
 * cannot rescue it: the client must resolve *and* address the request as the
 * host that was signed, or MinIO answers `SignatureDoesNotMatch`.
 *
 * Two consequences that shape the production deployment, both enforced below:
 *
 *   1. **`FILES_S3_ENDPOINT` is a bare hostname** — no scheme, no port, no
 *     path. `new MinioClient({ endPoint: "https://files.example.com" })`
 *     throws deep inside the first actor call; {@link filesS3Config} rejects
 *     it at read time with a message naming the variable instead.
 *   2. **The default port follows `FILES_S3_USE_SSL`.** With SSL on and no
 *     explicit port the default is 443, so the signed host is bare
 *     `files.example.com`. Keeping the dev default of 9000 here would sign
 *     `files.example.com:9000` — a URL that looks right, resolves right, and
 *     fails signature verification behind a 443 proxy.
 *
 * MinIO therefore needs its **own hostname**, not a path prefix on the API
 * host: the canonical request also covers the URI path, and this client always
 * signs path-style `/<bucket>/<key>` (`pathStyle` defaults to `true` for a
 * non-Amazon endpoint, matching the binding's `forcePathStyle: true`), so a
 * `handle_path` that strips a `/files` prefix would break the signature just
 * as surely as rewriting the Host would. See
 * `infra/nginx-proxy/vhost.d/files.conf`.
 *
 * ### Which leaves one question the above stops short of: sign for *which*
 * host?
 *
 * Settled 2026-09-18 (E3), by measurement, after an earlier version of this
 * comment recommended a candidate that cannot work and cost two agents a day
 * each. **In development there is no single answer, so there are two configs:
 * {@link filesS3Config} for a URL a browser will dial and
 * {@link filesS3InternalConfig} for a call this process makes itself.**
 *
 * **Signing for a host you do not yourself connect to works** — that part was
 * right, and it is what makes the split possible. Presigning is pure HMAC
 * (above), and MinIO verifies the signature against the `Host` it actually
 * receives, so a URL signed for `localhost:9100` verifies at a MinIO whose
 * in-network name is `minio:9000`: the port publish means the request really
 * does arrive with that authority. Measured — PUT, GET and `CopyObject` all
 * 200, and again end to end on 2026-09-18 including the retype in
 * `FileActor.verify`.
 *
 * **What was wrong was the belief that one hostname could serve both sides.**
 * On Docker Desktop for macOS no address means MinIO from both a host browser
 * and a container. Every candidate, measured:
 *
 *   - `minio:9000` — containers yes, host no. There is no such name off the
 *     compose network.
 *   - `host.docker.internal:9100` — containers yes, **host no**. `curl` exits 6
 *     (could not resolve), `dscacheutil -q host` returns nothing, and the
 *     host's `/etc/hosts` has no Docker entry: Docker Desktop injects that name
 *     into containers, never into the host. This was the previous
 *     recommendation here, and the claim that `packages/e2e` already used it is
 *     stale — the only occurrence there is a comment explaining why it was
 *     removed, since Playwright drives a *host* browser.
 *   - `localhost:9100` — host yes, containers no (their own loopback).
 *   - `*.localhost:9100` — resolves on both and still fails. **Bun hard-maps
 *     any `.localhost` name to loopback and never consults `/etc/hosts`,
 *     exactly as Chromium does.** Controlled probe: one container, two
 *     identical `/etc/hosts` entries pointing at the host gateway,
 *     `files.test` → 200 and `files.localhost` → "Unable to connect". The
 *     property that makes `.localhost` work in a browser is the property that
 *     makes it unusable in a container.
 *   - `192.168.65.254:9100` (the container-side host gateway) and the MinIO
 *     container's own IP — containers yes, host no: macOS has no route into
 *     Docker Desktop's networks, both time out.
 *
 * Two ways to manufacture a single name were considered and rejected:
 *
 *   - **A per-machine `/etc/hosts` entry** (`127.0.0.1 files.cellar.test`, with
 *     `extra_hosts: files.cellar.test:host-gateway` in the containers). Fully
 *     measured working — all four consumers, including the retype — using
 *     `curl --resolve`, which is precisely what that entry does. Rejected
 *     because it is a `sudo` step for every developer and every CI runner, for
 *     ever, and it makes a fresh clone not work; `bun run dev:bootstrap` exists
 *     so that a new worktree needs no manual setup.
 *   - **A public wildcard-loopback domain** (`localtest.me`, `lvh.me`,
 *     `nip.io`). Works with no setup — `files.localtest.me:9100` → 200 from
 *     this host — and is a supply-chain hazard: in the same measurement
 *     `vcap.me`, once the canonical name for this trick, resolved to
 *     103.224.182.214, a parking IP. A lapsed or hijacked name means a
 *     developer's browser PUTs image bytes to a stranger, and resolvers with
 *     rebinding protection strip loopback answers anyway.
 *
 * So the network position of the *consumer* decides the authority, and it is
 * part of the method name rather than a parameter: `FileActor.presignRead` and
 * `presignReadInternal`, `presignGetPublic` and `presignGetInternal` in
 * `src/lib/files-binding.ts`. {@link describeAuthorityMismatch} turns the one
 * remaining wrong-position mistake into a message that names both sides
 * instead of an opaque connect error.
 *
 * **Production is split the same way.** It used to resolve its one public
 * hostname to Caddy internally through a compose network alias, and claimed
 * not to be split — but the base compose file's `FILES_S3_INTERNAL_*` pair was
 * inherited by the production overlay all along. Since the edge moved behind
 * the host's shared nginx-proxy there is no alias to resolve, and the split is
 * deliberate there too: browser-facing URLs are signed for
 * `FILES_S3_ENDPOINT` (the public files host, 443), and everything this
 * process dials itself goes to `minio:9000` on the compose network. Same
 * code path in both lanes.
 */
import {
  CopyDestinationOptions,
  CopySourceOptions,
  Client as MinioClient,
} from "minio";

/** Mirrors `infra/dapr/components/files-binding.yaml`'s literal values. */
const DEFAULT_BUCKET = "cellar-files";
/**
 * The in-network name, and the default for **both** configs — so a process
 * started with no `FILES_S3_*` at all behaves exactly as it did before E3
 * (correct for every server-side call, wrong for a browser). It is the compose
 * file that says the browser-facing authority is different, because only the
 * deployment knows that.
 */
const DEFAULT_ENDPOINT = "minio";
/** MinIO's own S3 port — the default only while `FILES_S3_USE_SSL` is off. */
const DEFAULT_PLAIN_PORT = 9000;
const DEFAULT_TLS_PORT = 443;
const DEFAULT_REGION = "us-east-1";

export type FilesS3Config = {
  readonly endPoint: string;
  readonly port: number;
  readonly useSSL: boolean;
  readonly region: string;
  readonly bucket: string;
  readonly accessKey: string;
  readonly secretKey: string;
};

const read = (
  environment: NodeJS.ProcessEnv,
  name: string,
): string | undefined => {
  const value = environment[name];
  return value === undefined || value === "" ? undefined : value;
};

/**
 * `endPoint` is a hostname, full stop. The `minio` client concatenates it into
 * the `Host` header, so anything else silently produces a URL that can never
 * verify — or, for a scheme, an `InvalidEndpointError` thrown from whichever
 * actor method happened to sign first.
 */
const assertBareHostname = (endPoint: string): string => {
  const problem =
    endPoint.includes("://") || endPoint.includes("//")
      ? "a scheme"
      : endPoint.includes(":")
        ? "a port"
        : endPoint.includes("/")
          ? "a path"
          : undefined;
  if (problem !== undefined) {
    throw new Error(
      `[files] FILES_S3_ENDPOINT must be a bare hostname, but ${JSON.stringify(endPoint)} carries ${problem}. ` +
        'Use FILES_S3_USE_SSL for the scheme and FILES_S3_PORT for the port (e.g. FILES_S3_ENDPOINT="files.example.com", FILES_S3_USE_SSL=true).',
    );
  }
  return endPoint;
};

/**
 * The **browser-facing** authority: what every URL handed outside this process
 * is signed for, and therefore the one address a browser has to be able to
 * dial (`connect-src` in `services/client/next.config.mjs` has to permit it,
 * and `FILES_S3_PUBLIC_URL` in the client image's build has to equal it).
 *
 * Reads the same credentials `infra/docker-compose.yml` already gives the
 * `files` binding's sidecar (`MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`), plus
 * the `actors` service, which also needs them now that presigning happens
 * here instead of only in the sidecar.
 *
 * `environment` is a parameter so a test can assert what a *production*-shaped
 * environment signs without mutating the process — see `s3-presign.test.ts`.
 */
export const filesS3Config = (
  environment: NodeJS.ProcessEnv = process.env,
): FilesS3Config => {
  const useSSL = read(environment, "FILES_S3_USE_SSL") === "true";
  const port = read(environment, "FILES_S3_PORT");
  return {
    endPoint: assertBareHostname(
      read(environment, "FILES_S3_ENDPOINT") ?? DEFAULT_ENDPOINT,
    ),
    // Default follows the scheme, so the TLS case signs a bare host. See the
    // module comment: 9000 under https would sign `host:9000`.
    port:
      port === undefined
        ? useSSL
          ? DEFAULT_TLS_PORT
          : DEFAULT_PLAIN_PORT
        : Number(port),
    useSSL,
    region: read(environment, "FILES_S3_REGION") ?? DEFAULT_REGION,
    bucket: read(environment, "FILES_S3_BUCKET") ?? DEFAULT_BUCKET,
    // Same fallback default `infra/docker-compose.yml` and `infra/.env.example`
    // use, so a fresh checkout with no `.env` still signs a working URL locally.
    accessKey: read(environment, "MINIO_ROOT_USER") ?? "cellar",
    secretKey: filesSecretKey(environment),
  };
};

/**
 * The development lane's MinIO root password — published in
 * `infra/docker-compose.yml` and `infra/.env.example`, so it is a secret to
 * nobody.
 */
export const PUBLISHED_DEV_FILES_SECRET = "cellar-dev-secret";

/**
 * `MINIO_ROOT_PASSWORD`, with the development fallback **outside production
 * only**.
 *
 * The fallback is what lets a fresh checkout sign a working URL with no `.env`,
 * and it used to apply everywhere. In the built image (`NODE_ENV=production`,
 * set by `services/actors/Dockerfile`) a missing variable then signed every
 * upload and every image URL with the published value, against a MinIO whose
 * S3 API is internet-facing through the edge's `PUBLIC_FILES_HOST` — and nothing
 * said so. The deploy's `check-prod-config.mjs` refuses the published value
 * before compose starts; this is the same rule where the value is spent, so a
 * deployment that skipped that script still cannot sign with it.
 *
 * Throws rather than warns: a presigner holding a public secret is not a
 * degraded mode, it is someone else's bucket.
 */
const filesSecretKey = (environment: NodeJS.ProcessEnv): string => {
  const secret = read(environment, "MINIO_ROOT_PASSWORD");
  if (environment.NODE_ENV !== "production") {
    return secret ?? PUBLISHED_DEV_FILES_SECRET;
  }
  if (secret === undefined) {
    throw new Error(
      "[files] MINIO_ROOT_PASSWORD is required in production. The development " +
        `fallback (${JSON.stringify(PUBLISHED_DEV_FILES_SECRET)}) is published in ` +
        "infra/docker-compose.yml, and every URL this host signs would be signed with it.",
    );
  }
  if (secret === PUBLISHED_DEV_FILES_SECRET) {
    throw new Error(
      "[files] MINIO_ROOT_PASSWORD is the development lane's published value in " +
        "production. MinIO's S3 API is public behind PUBLIC_FILES_HOST, so anyone " +
        "with this repository could sign requests against the bucket. Set a real one.",
    );
  }
  return secret;
};

/**
 * The **in-network** authority: what this process dials itself, and what a URL
 * meant for another process on the same network must be signed for.
 *
 * Unset `FILES_S3_INTERNAL_ENDPOINT` means "one name is correct from both
 * sides" and returns {@link filesS3Config} untouched — which is what a bare
 * `bun src/index.ts` with no `FILES_S3_*` at all gets. Setting it is how a
 * compose stack says that its browser-facing address (`localhost:<published
 * port>` in development, the public files host in production) is not the
 * address a container dials MinIO at (`infra/docker-compose.yml`, inherited by
 * the production overlay).
 *
 * Only the address differs. Bucket, region and credentials are one set: the
 * two configs are two ways to reach the same object store, not two stores.
 */
export const filesS3InternalConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): FilesS3Config => {
  const publicConfig = filesS3Config(environment);
  const endPoint = read(environment, "FILES_S3_INTERNAL_ENDPOINT");
  if (endPoint === undefined) return publicConfig;
  const useSSL = read(environment, "FILES_S3_INTERNAL_USE_SSL") === "true";
  const port = read(environment, "FILES_S3_INTERNAL_PORT");
  return {
    ...publicConfig,
    endPoint: assertBareHostname(endPoint),
    port:
      port === undefined
        ? useSSL
          ? DEFAULT_TLS_PORT
          : DEFAULT_PLAIN_PORT
        : Number(port),
    useSSL,
  };
};

/**
 * The origin every URL this module signs will carry, and the origin a browser
 * must therefore be able to reach. Mirrors the `minio` client's own rule:
 * the port is omitted exactly when it is the default for the scheme.
 *
 * This is what `infra/.env.prod.example`'s `PUBLIC_FILES_ORIGIN` has to equal,
 * and what the host's nginx-proxy has to terminate TLS for
 * (`VIRTUAL_HOST` on `minio` in `infra/docker-compose.prod.yml`).
 */
export const signedOrigin = (config: FilesS3Config): string => {
  const scheme = config.useSSL ? "https" : "http";
  const isDefaultPort =
    (config.useSSL && config.port === DEFAULT_TLS_PORT) ||
    (!config.useSSL && config.port === 80);
  return isDefaultPort
    ? `${scheme}://${config.endPoint}`
    : `${scheme}://${config.endPoint}:${config.port}`;
};

/**
 * Keyed, not single-slot: since E3 there are two live configs — the
 * browser-facing one and the in-network one — and a one-entry cache would
 * rebuild a client on every alternation between them.
 */
const cached = new Map<string, MinioClient>();

const clientFor = (config: FilesS3Config): MinioClient => {
  const cacheKey = `${config.endPoint}:${config.port}:${config.useSSL}:${config.region}:${config.accessKey}`;
  const hit = cached.get(cacheKey);
  if (hit !== undefined) return hit;
  const client = new MinioClient({
    endPoint: config.endPoint,
    port: config.port,
    useSSL: config.useSSL,
    region: config.region,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
  });
  cached.set(cacheKey, client);
  return client;
};

/**
 * The largest object this app will keep.
 *
 * Deliberately the same number as `MAX_IMAGE_BYTES` in `src/lib/ai/images.ts`,
 * and the two must move together: every `kind` uploaded here is a photograph
 * bound for a vision seam or an `<img>`, so an object the AI download path
 * would refuse to read is an object there was never any point storing. They
 * are not wired to one constant on purpose — a `lib/` signing module importing
 * from `lib/ai/` would invert the dependency — so this comment is the join.
 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * A presigned PUT URL for `key`, valid for `ttlSeconds`. Pure signing — no
 * network call, so no live MinIO is needed to exercise this in a test.
 *
 * Always signed with the browser-facing config: the whole point of the upload
 * protocol is that the client PUTs the bytes itself (`target-stack.md` §4).
 *
 * ## This URL cannot carry a size limit, and that is a property of SigV4
 *
 * `presignedPutObject` signs **`host` and nothing else** — every URL it returns
 * carries `X-Amz-SignedHeaders=host`, which is the same fact the media-type
 * section below is built on. An unsigned header is one the client chooses, so
 * a `Content-Length` "limit" expressed as a header on a presigned PUT is a
 * limit the uploader enforces against itself. There is no query parameter for
 * it either: SigV4 query presigning covers the string-to-sign, not the body.
 *
 * The S3 mechanism that *does* bound an upload before it is written is a
 * **POST policy** — `presignedPostPolicy` with `setContentLengthRange`, where
 * the bound is inside the signed policy document and the store rejects the
 * write itself. Adopting it means changing the upload from a `PUT` of raw
 * bytes to a multipart `POST` carrying policy fields, on both this side and
 * every client that uploads, which is a protocol change rather than a patch.
 *
 * So the bound that exists today is applied where the bytes first become
 * observable: `FileActor.verify` refuses anything over
 * {@link MAX_UPLOAD_BYTES} and deletes the object. That leaves a real
 * residual, stated plainly rather than papered over — a signed-in caller
 * holding a live upload URL can still *write* an arbitrarily large object, and
 * it survives until a verify or a sweep removes it. What it cannot do is make
 * that object readable: an unverified `files` row never yields a read URL
 * (`src/lib/file-verification.ts`), so the object is unreachable garbage with
 * a 15-minute window to create it, not stored content.
 */
export const presignedPutUrl = async (
  config: FilesS3Config,
  key: string,
  ttlSeconds: number,
): Promise<string> =>
  clientFor(config).presignedPutObject(config.bucket, key, ttlSeconds);

/**
 * A presigned GET URL for `key`, valid for `ttlSeconds` — the read half, and
 * the reason `config` is a parameter rather than a module-level constant.
 *
 * `FileActor.presignRead` signs with {@link filesS3Config} because a browser
 * will dial it; `FileActor.presignReadInternal` signs with
 * {@link filesS3InternalConfig} because the AI seams fetch it from inside the
 * compose network. Same object, same credentials, two authorities — see this
 * module's E3 section for why one would not do.
 *
 * The Dapr `files` binding can presign a GET too (`presignGetInternal` in
 * `files-binding.ts`), but only ever for the endpoint it dials itself, which
 * is why the browser-facing URL is signed here instead.
 */
export const presignedGetUrl = async (
  config: FilesS3Config,
  key: string,
  ttlSeconds: number,
  options: PresignGetOptions = {},
): Promise<string> =>
  clientFor(config).presignedGetObject(
    config.bucket,
    key,
    ttlSeconds,
    options.responseHeaders ?? {},
    options.requestDate,
  );

/**
 * What {@link presignedGetUrl} signs beyond the key and the TTL.
 *
 * - `requestDate` — the `X-Amz-Date` to sign with. The `minio` client
 *   (8.0.7, `presignedUrl` in `internal/client.js`) defaults it to `new Date()`,
 *   which is why two signatures of the same key a second apart are two
 *   different URLs. {@link stableReadWindow} pins it to a window boundary.
 * - `responseHeaders` — S3's `response-*` query overrides
 *   (`response-cache-control`, `response-content-type`, …). They ride in the
 *   query string, so they are **inside** the signature: a holder of the URL
 *   cannot change them without invalidating it.
 */
export type PresignGetOptions = {
  readonly requestDate?: Date;
  readonly responseHeaders?: Readonly<Record<string, string>>;
};

/**
 * ## Stable read URLs: one URL per object per window
 *
 * Measured in production on 2026-10-06: `presignRead` signed with the current
 * time, so every page load handed the browser a **different** URL for the
 * same image — `X-Amz-Date` and `X-Amz-Signature` change every second — and
 * the HTTP cache, which keys on the URL, never hit once. MinIO's GET also
 * carried no `Cache-Control` at all (only `ETag`/`Last-Modified`), so even a
 * repeated URL would have been revalidated.
 *
 * The fix is to make the URL a pure function of `(key, window)`: sign with a
 * `requestDate` floored to a fixed window boundary (UTC epoch multiples of
 * `windowSeconds`), so every request inside one window signs byte-identical
 * input and gets a byte-identical URL. Same object, same window → same URL →
 * browser cache hit, and `/_next/image`'s optimizer cache too (its key is the
 * source URL).
 *
 * ### Expiry: `window + minValidity`, so no URL is handed out nearly dead
 *
 * A URL signed at the window start `B` is handed out until `B + window`. If it
 * expired at `B + window`, one handed out a second before the boundary would
 * be dead a second later. So the signed expiry is `window + minValidity`, and
 * for any moment `t` in `[B, B + window)` the URL has
 * `B + window + minValidity - t` seconds left: **always more than
 * `minValidity`**, and at most `window + minValidity`. That lower bound is the
 * guarantee callers get — the old per-request TTL was 30 min, so the default
 * minimum (1 h) is strictly longer than anything a page could count on before.
 *
 * SigV4 refuses expiries over 7 days (`PRESIGN_EXPIRY_DAYS_MAX`), so
 * `window + minValidity` must stay ≤ 604800; {@link readUrlWindowSettings}
 * enforces it at read time rather than letting the first signature throw.
 *
 * ### `Cache-Control: private, max-age=<window>, immutable`
 *
 * Sent by MinIO as a `response-cache-control` override, signed into the URL.
 *
 * - `private` — the bytes are a signed, per-viewer read; no shared cache
 *   (Cloudflare, a corporate proxy) may keep them. Cloudflare already reports
 *   `cf-cache-status: DYNAMIC` for these, and `private` keeps it that way.
 * - `max-age=<window>` — the header is part of the URL, so it has to be the
 *   same for every request in the window and cannot count down. `window` is
 *   what "seconds until the URL expires, minus the margin" equals for a URL
 *   at its own window start, and no page asks for this URL after
 *   `B + window` except a page already holding it, for at most `minValidity`
 *   more. A copy kept longer than the URL lives is never asked for again (the
 *   next window signs a different URL) and is harmless: the browser already
 *   has the bytes.
 * - `immutable` — a served key is written once, by `FileActor.verify`'s
 *   copy-away, and never rewritten (`file-actor.ts`, "The upload key is not
 *   the served key"), so revalidating it on reload is pure waste.
 *
 * ### What this changes about security, stated plainly
 *
 * Visibility is unchanged — `FileActor` still checks it before every
 * signature, and the URL is still private and signed. What changes is
 * **lifetime**: a URL leaked from a page used to die within 30 min and now
 * lives up to `window + minValidity` (6 days 1 h by default). Revoking a viewer's
 * access no longer stops a URL they already hold for that long either. That is
 * the price of a cacheable URL; shrink `FILES_READ_URL_WINDOW_SECONDS` to buy
 * it back at the cost of more cache misses.
 */
export type ReadUrlWindowSettings = {
  readonly windowSeconds: number;
  readonly minValiditySeconds: number;
};

/**
 * Six days: one cache miss per image per viewer, and one `/_next/image`
 * transformation per image per width, every six days.
 *
 * Was a day. Every rollover is a new `url=` for every image, and so a fresh
 * optimizer transformation on Vercel for every image × width anyone views —
 * daily, where the Nhost-era stable URLs re-transformed once a month. Six days
 * is as long as SigV4 allows with the minimum validity on top
 * ({@link SIGV4_MAX_EXPIRY_SECONDS}); the cost is the URL lifetime below.
 */
export const DEFAULT_READ_URL_WINDOW_SECONDS = 6 * 24 * 60 * 60;
/** Twice the 30 min the per-request TTL used to promise. */
export const DEFAULT_READ_URL_MIN_VALIDITY_SECONDS = 60 * 60;
/** SigV4's own ceiling (`PRESIGN_EXPIRY_DAYS_MAX` in `minio`). */
const SIGV4_MAX_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

const positiveInteger = (
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number => {
  const raw = read(environment, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 60) {
    throw new Error(
      `[files] ${name} must be a whole number of seconds, at least 60; got ${JSON.stringify(raw)}.`,
    );
  }
  return value;
};

/**
 * `FILES_READ_URL_WINDOW_SECONDS` / `FILES_READ_URL_MIN_VALIDITY_SECONDS`,
 * defaulting to 6 days / 1 h. Throws, naming the variables, when the pair would
 * exceed SigV4's 7-day maximum.
 */
export const readUrlWindowSettings = (
  environment: NodeJS.ProcessEnv = process.env,
): ReadUrlWindowSettings => {
  const windowSeconds = positiveInteger(
    environment,
    "FILES_READ_URL_WINDOW_SECONDS",
    DEFAULT_READ_URL_WINDOW_SECONDS,
  );
  const minValiditySeconds = positiveInteger(
    environment,
    "FILES_READ_URL_MIN_VALIDITY_SECONDS",
    DEFAULT_READ_URL_MIN_VALIDITY_SECONDS,
  );
  if (windowSeconds + minValiditySeconds > SIGV4_MAX_EXPIRY_SECONDS) {
    throw new Error(
      "[files] FILES_READ_URL_WINDOW_SECONDS + FILES_READ_URL_MIN_VALIDITY_SECONDS " +
        `is ${windowSeconds + minValiditySeconds}s, over SigV4's 7-day (${SIGV4_MAX_EXPIRY_SECONDS}s) presign maximum.`,
    );
  }
  return { windowSeconds, minValiditySeconds };
};

/** Everything one stable read signature needs, derived from a moment. */
export type StableReadWindow = {
  /** The window start — the `X-Amz-Date` every signature in the window uses. */
  readonly requestDate: Date;
  /** `X-Amz-Expires`: window + minimum validity. */
  readonly expirySeconds: number;
  /** When the URL stops verifying: `requestDate + expirySeconds`. */
  readonly expiresAt: Date;
  /** The `response-cache-control` value signed into the URL. */
  readonly cacheControl: string;
};

/** The window `now` falls in; see the section above for every number. */
export const stableReadWindow = (
  now: Date,
  settings: ReadUrlWindowSettings,
): StableReadWindow => {
  const windowMs = settings.windowSeconds * 1000;
  const startMs = Math.floor(now.getTime() / windowMs) * windowMs;
  const expirySeconds = settings.windowSeconds + settings.minValiditySeconds;
  return {
    requestDate: new Date(startMs),
    expirySeconds,
    expiresAt: new Date(startMs + expirySeconds * 1000),
    cacheControl: `private, max-age=${settings.windowSeconds}, immutable`,
  };
};

/** {@link presignedGetUrl} for a browser, signed for `window`. */
export const presignedStableGetUrl = async (
  config: FilesS3Config,
  key: string,
  window: StableReadWindow,
): Promise<string> =>
  presignedGetUrl(config, key, window.expirySeconds, {
    requestDate: window.requestDate,
    responseHeaders: { "response-cache-control": window.cacheControl },
  });

/**
 * Name a URL that was signed for the wrong side of the split, or `undefined`
 * when it is fine.
 *
 * The failure this exists for is invisible otherwise: a URL signed for
 * `localhost:9100` and fetched from inside a container reaches that
 * container's own loopback and fails as `TypeError: Unable to connect` with no
 * mention of MinIO, a signature, or a network position. Callers turn this into
 * a real error message (see `src/lib/ai/images.ts`).
 *
 * Silent when the two configs are equal (no `FILES_S3_INTERNAL_ENDPOINT`):
 * the expected origin is then the only origin, and nothing can mismatch.
 */
export const describeAuthorityMismatch = (
  url: string,
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined => {
  const internal = signedOrigin(filesS3InternalConfig(environment));
  const browserFacing = signedOrigin(filesS3Config(environment));
  if (internal === browserFacing) return undefined;
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return `[files] not a URL at all: ${JSON.stringify(url.slice(0, 80))}`;
  }
  if (origin === internal) return undefined;
  return (
    `[files] this URL is signed for ${origin}, which is the browser-facing ` +
    `authority (FILES_S3_ENDPOINT/FILES_S3_PORT). A caller inside the network ` +
    `has to use ${internal} (FILES_S3_INTERNAL_ENDPOINT/FILES_S3_INTERNAL_PORT) ` +
    "— ask FileActor.presignReadInternal, not FileActor.presignRead. SigV4 " +
    "covers the Host header, so the authority cannot be swapped after signing."
  );
};

/**
 * Where {@link setObjectMediaType}'s copy lands, and on what condition.
 *
 * - `into` — the destination key; the source key itself when absent (the
 *   in-place metadata replace). `FileActor.verify` copies an upload **away**
 *   from the key its presigned PUT signs, so that a PUT made with the same,
 *   still-live URL after verification lands on an object nothing reads
 *   (W4 security F5 — see `file-actor.ts`, "The upload key is not the served
 *   key").
 * - `ifMatch` — an ETag the source must still carry
 *   (`x-amz-copy-source-if-match`). The store refuses the copy with
 *   `PreconditionFailed` when the source was replaced after it was checked,
 *   so the bytes that are published are the bytes that were sized and
 *   sniffed, not whatever a racing PUT put there in between.
 */
export type MediaTypeCopyOptions = {
  readonly into?: string;
  readonly ifMatch?: string;
};

/**
 * What a browser is told an object is, and whether it renders it.
 *
 * ## Why this has to exist at all
 *
 * `presignedPutObject` above signs **`host` and nothing else** — every URL it
 * returns carries `X-Amz-SignedHeaders=host`. So the `Content-Type` the
 * browser puts on its PUT is unsigned, unconstrained, and stored verbatim;
 * MinIO then replays that exact string on every presigned GET of the object.
 * Measured end to end against the compose stack's MinIO on 2026-09-18: a PUT
 * carrying `Content-Type: text/html` is accepted (200) and the subsequent GET
 * answers `content-type: text/html`, with no `Content-Disposition` and
 * therefore inline rendering. An HTML document uploaded that way **executes**
 * when the URL is opened as a top-level navigation.
 *
 * `FileActor.verify` sniffing the bytes is necessary but not sufficient for
 * that: a JPEG/HTML polyglot — real `FF D8 FF` magic followed by a `<script>`
 * — satisfies `detectImageMime` and still serves as `text/html`, because the
 * served header never came from the bytes. This closes that: once `verify`
 * knows what the object actually is, the object is made to *say* so.
 *
 * ## Why a copy, and why the bytes are safe
 *
 * S3 has no "change the headers" call; the way to replace an object's
 * metadata in place is `CopyObject` onto itself with
 * `MetadataDirective: REPLACE`, which is what this does by default — and
 * with {@link MediaTypeCopyOptions.into}, the same copy onto another key,
 * which is how `FileActor.verify` uses it now. It is a server-side
 * copy — the bytes never leave MinIO, never pass through the Dapr sidecar
 * (target-stack §4), and are byte-identical afterwards (measured on the same
 * run). `size` and `etag` are both unchanged too, also measured: the ETag is
 * the MD5 of the content, and the content is what a metadata replace does not
 * touch. So `FileActor.verify` may read `stat` either side of this call.
 *
 * ## `Content-Disposition: attachment`
 *
 * Belt and braces, and free. `Content-Disposition` is honoured for top-level
 * navigations and ignored for subresource loads, so `attachment` turns "open
 * the file URL in a tab" from *render* into *download* while leaving the app's
 * `<img src>` untouched — measured in a browser against this MinIO: a PNG
 * served with `attachment` still loads in an `<img>` (`naturalWidth > 0`).
 * `fetch` ignores the header outright, so `readHead` and `src/lib/ai/images.ts`
 * are unaffected. It means a future bypass of `detectImageMime` still cannot
 * get a document to render on the files origin.
 */
export const setObjectMediaType = async (
  config: FilesS3Config,
  key: string,
  contentType: string,
  options: MediaTypeCopyOptions = {},
): Promise<void> => {
  await clientFor(config).copyObject(
    new CopySourceOptions({
      Bucket: config.bucket,
      Object: key,
      ...(options.ifMatch === undefined ? {} : { MatchETag: options.ifMatch }),
    }),
    new CopyDestinationOptions({
      Bucket: config.bucket,
      Object: options.into ?? key,
      MetadataDirective: "REPLACE",
      Headers: {
        "Content-Type": contentType,
        "Content-Disposition": "attachment",
      },
    }),
  );
};
