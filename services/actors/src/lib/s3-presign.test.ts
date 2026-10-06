/**
 * E3 · the presigned-URL host is the deployment's single sharpest edge.
 *
 * `X-Amz-SignedHeaders=host` puts the authority *inside* the signature, so the
 * URL cannot be rewritten in transit and a hosts-file alias cannot rescue it.
 * If `FILES_S3_ENDPOINT`/`FILES_S3_PORT`/`FILES_S3_USE_SSL` are ever reverted
 * to the compose-internal defaults in a deployed environment, every browser
 * upload and every image `<img>` 403s with `SignatureDoesNotMatch`, and
 * nothing in the application logs says why.
 *
 * These tests are pure: `minio` presigning is HMAC arithmetic and makes no
 * network call, so the whole production-shaped configuration can be asserted
 * without MinIO, DNS or TLS.
 *
 * **What is NOT covered here, deliberately.** A real HTTP round trip against
 * the *public* hostname needs public DNS and a Let's Encrypt certificate, and
 * so cannot run from a developer machine or from CI. It was verified by hand
 * against the compose stack instead, using a second hostname for the same
 * MinIO (`localhost:9100` vs `minio:9000`) — signing for one and requesting
 * the other returns 403 `SignatureDoesNotMatch`, and signing for the host the
 * request actually uses round-trips. See `docs/architecture/deploy-loki.md`
 * ("Verifying the file path"), which carries the transcript and the one-liner
 * to repeat it against the real host after cutover.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_READ_URL_MIN_VALIDITY_SECONDS,
  DEFAULT_READ_URL_WINDOW_SECONDS,
  describeAuthorityMismatch,
  type FilesS3Config,
  filesS3Config,
  filesS3InternalConfig,
  presignedGetUrl,
  presignedPutUrl,
  presignedStableGetUrl,
  readUrlWindowSettings,
  signedOrigin,
  stableReadWindow,
} from "./s3-presign.ts";

/**
 * What `infra/docker-compose.yml` gives the `actors` service: two authorities,
 * because on Docker Desktop for macOS no single one reaches MinIO from both a
 * host browser and a container (the module comment has every measurement).
 */
const DEV_ENV = {
  FILES_S3_ENDPOINT: "localhost",
  FILES_S3_PORT: "9100",
  FILES_S3_USE_SSL: "false",
  FILES_S3_BUCKET: "cellar-files",
  FILES_S3_INTERNAL_ENDPOINT: "minio",
  FILES_S3_INTERNAL_PORT: "9000",
  MINIO_ROOT_USER: "cellar",
  MINIO_ROOT_PASSWORD: "cellar-dev-secret",
} satisfies NodeJS.ProcessEnv;

/** The shape `infra/.env.prod.example` produces. Placeholders, not real hosts. */
const PROD_ENV = {
  FILES_S3_ENDPOINT: "files.cellar.example.com",
  FILES_S3_USE_SSL: "true",
  FILES_S3_BUCKET: "cellar-files",
  FILES_S3_REGION: "us-east-1",
  MINIO_ROOT_USER: "prod-access-key",
  MINIO_ROOT_PASSWORD: "prod-secret-key",
} satisfies NodeJS.ProcessEnv;

const PUBLIC_FILES_ORIGIN = "https://files.cellar.example.com";

const KEY = "item-image/6f1d2b7c-0000-4000-8000-000000000001.jpg";

describe("filesS3Config", () => {
  it("defaults to the compose-internal MinIO, which is what dev signs", () => {
    expect(filesS3Config({})).toEqual({
      endPoint: "minio",
      port: 9000,
      useSSL: false,
      region: "us-east-1",
      bucket: "cellar-files",
      accessKey: "cellar",
      secretKey: "cellar-dev-secret",
    } satisfies FilesS3Config);
  });

  it("defaults the port to 443 under TLS, never to MinIO's 9000", () => {
    // The trap this guards: `https://files.example.com:9000/...` resolves,
    // looks plausible, and fails signature verification behind a 443 proxy.
    expect(filesS3Config(PROD_ENV).port).toBe(443);
    expect(signedOrigin(filesS3Config(PROD_ENV))).toBe(PUBLIC_FILES_ORIGIN);
  });

  it("keeps an explicit port, TLS or not", () => {
    expect(filesS3Config({ ...PROD_ENV, FILES_S3_PORT: "8443" }).port).toBe(
      8443,
    );
    expect(
      signedOrigin(filesS3Config({ ...PROD_ENV, FILES_S3_PORT: "8443" })),
    ).toBe("https://files.cellar.example.com:8443");
  });

  it.each([
    ["https://files.cellar.example.com", "a scheme"],
    ["files.cellar.example.com:443", "a port"],
    ["files.cellar.example.com/cellar-files", "a path"],
  ])("rejects %s in FILES_S3_ENDPOINT (%s)", (endPoint, problem) => {
    expect(() => filesS3Config({ FILES_S3_ENDPOINT: endPoint })).toThrow(
      new RegExp(`bare hostname.*${problem}`, "s"),
    );
  });

  it("treats an empty value as unset, which is how compose passes one", () => {
    expect(filesS3Config({ FILES_S3_ENDPOINT: "" }).endPoint).toBe("minio");
  });

  /*
   * F7 (W4 security review): the development fallback used to apply in the
   * built image too, so a production host with no MINIO_ROOT_PASSWORD signed
   * with the value infra/docker-compose.yml publishes.
   */
  describe("the published development secret", () => {
    it("is refused in production when MINIO_ROOT_PASSWORD is unset", () => {
      expect(() =>
        filesS3Config({
          ...PROD_ENV,
          MINIO_ROOT_PASSWORD: "",
          NODE_ENV: "production",
        }),
      ).toThrow(/MINIO_ROOT_PASSWORD is required in production/);
    });

    it("is refused in production when set to the published value", () => {
      expect(() =>
        filesS3Config({
          ...PROD_ENV,
          MINIO_ROOT_PASSWORD: "cellar-dev-secret",
          NODE_ENV: "production",
        }),
      ).toThrow(/published value in production/);
    });

    it("is refused through the internal config too, which reads the same one", () => {
      expect(() =>
        filesS3InternalConfig({
          ...PROD_ENV,
          MINIO_ROOT_PASSWORD: "",
          NODE_ENV: "production",
        }),
      ).toThrow(/MINIO_ROOT_PASSWORD/);
    });

    it("signs with a real secret in production", () => {
      expect(
        filesS3Config({ ...PROD_ENV, NODE_ENV: "production" }).secretKey,
      ).toBe("prod-secret-key");
    });

    it("stays the fallback outside production, so a fresh checkout still signs", () => {
      expect(filesS3Config({ NODE_ENV: "development" }).secretKey).toBe(
        "cellar-dev-secret",
      );
    });
  });
});

describe("presignedPutUrl signs for the host the browser must address", () => {
  it("signs the public origin when the production env vars are set", async () => {
    const url = new URL(
      await presignedPutUrl(filesS3Config(PROD_ENV), KEY, 900),
    );

    // The assertion that fails the moment the config is reverted.
    expect(url.origin).toBe(PUBLIC_FILES_ORIGIN);
    expect(url.host).toBe(new URL(PUBLIC_FILES_ORIGIN).host);
    // No stray `:9000` smuggled into the authority.
    expect(url.port).toBe("");
  });

  it("signs path-style /<bucket>/<key>, so no path prefix may be stripped", async () => {
    const url = new URL(
      await presignedPutUrl(filesS3Config(PROD_ENV), KEY, 900),
    );
    expect(url.pathname).toBe(`/cellar-files/${KEY}`);
  });

  it("puts host inside the signature, which is why none of this is rewritable", async () => {
    const url = new URL(
      await presignedPutUrl(filesS3Config(PROD_ENV), KEY, 900),
    );
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get("X-Amz-Credential")).toContain(
      "prod-access-key/",
    );
  });

  it("still signs the compose-internal host on a default (dev) environment", async () => {
    const url = new URL(await presignedPutUrl(filesS3Config({}), KEY, 900));
    expect(url.origin).toBe("http://minio:9000");
  });

  it.each([
    [{ FILES_S3_ENDPOINT: "minio" }, "http://minio:9000"],
    [
      { FILES_S3_ENDPOINT: "files.example.com", FILES_S3_USE_SSL: "true" },
      "https://files.example.com",
    ],
    [
      {
        FILES_S3_ENDPOINT: "files.example.com",
        FILES_S3_USE_SSL: "true",
        FILES_S3_PORT: "8443",
      },
      "https://files.example.com:8443",
    ],
    [{ FILES_S3_ENDPOINT: "loki.lan", FILES_S3_PORT: "80" }, "http://loki.lan"],
  ])("signedOrigin(%o) === the URL's own origin (%s)", async (environment, expected) => {
    const config = filesS3Config(environment);
    expect(signedOrigin(config)).toBe(expected);
    // `signedOrigin` is what the deploy docs and `.env.prod.example` quote;
    // this keeps it honest against what is actually signed.
    expect(new URL(await presignedPutUrl(config, KEY, 900)).origin).toBe(
      expected,
    );
  });
});

/**
 * E3 · the split, and the one property that makes it safe: production does not
 * have one.
 */
describe("filesS3InternalConfig", () => {
  it("is the public config when FILES_S3_INTERNAL_ENDPOINT is unset", () => {
    // A process with no internal endpoint configured: one name for both
    // sides, so nothing can sign for the wrong side. (Both compose lanes do
    // set one — infra/docker-compose.yml, inherited by the prod overlay.)
    expect(filesS3InternalConfig(PROD_ENV)).toEqual(filesS3Config(PROD_ENV));
    expect(filesS3InternalConfig({})).toEqual(filesS3Config({}));
  });

  it("differs from the public config only in the address", () => {
    const browserFacing = filesS3Config(DEV_ENV);
    const internal = filesS3InternalConfig(DEV_ENV);
    expect(signedOrigin(browserFacing)).toBe("http://localhost:9100");
    expect(signedOrigin(internal)).toBe("http://minio:9000");
    // Same store, same credentials: two ways to reach one bucket.
    expect({ ...internal, endPoint: "", port: 0 }).toEqual({
      ...browserFacing,
      endPoint: "",
      port: 0,
    });
  });

  it("signs a GET for whichever side it is handed", async () => {
    expect(
      new URL(await presignedGetUrl(filesS3Config(DEV_ENV), KEY, 900)).origin,
    ).toBe("http://localhost:9100");
    expect(
      new URL(await presignedGetUrl(filesS3InternalConfig(DEV_ENV), KEY, 900))
        .origin,
    ).toBe("http://minio:9000");
  });
});

describe("describeAuthorityMismatch", () => {
  it("names both positions when an in-network caller holds a browser URL", async () => {
    const url = await presignedGetUrl(filesS3Config(DEV_ENV), KEY, 900);
    const message = describeAuthorityMismatch(url, DEV_ENV);
    expect(message).toBeDefined();
    // The message has to carry both addresses: the whole failure is that the
    // socket error it replaces mentions neither.
    expect(message).toContain("http://localhost:9100");
    expect(message).toContain("http://minio:9000");
    expect(message).toContain("presignReadInternal");
  });

  it("is silent on the internal URL, which is the normal case", async () => {
    const url = await presignedGetUrl(filesS3InternalConfig(DEV_ENV), KEY, 900);
    expect(describeAuthorityMismatch(url, DEV_ENV)).toBeUndefined();
  });

  it("is silent in production, where there is only one authority", async () => {
    // Belt and braces: the public URL *is* the internal URL there, so this
    // guard can never fire on a deployed environment and cannot become a
    // source of spurious failures on the AI path.
    const url = await presignedGetUrl(filesS3Config(PROD_ENV), KEY, 900);
    expect(describeAuthorityMismatch(url, PROD_ENV)).toBeUndefined();
  });

  it("says so when handed something that is not a URL", () => {
    expect(describeAuthorityMismatch("not a url", DEV_ENV)).toContain(
      "not a URL",
    );
  });
});

/**
 * Stable read URLs (production, 2026-10-06: every page load signed a new URL
 * for the same image, so the browser cache never hit). The URL has to be a
 * pure function of (key, window), and every URL handed out has to leave the
 * caller at least the documented minimum of validity.
 */
describe("stable read URLs", () => {
  const settings = readUrlWindowSettings({});
  const HOUR = 60 * 60 * 1000;
  /** A window start, so offsets below are unambiguous. */
  const START = Date.UTC(2026, 9, 6);
  const sign = (at: number, key = KEY) =>
    presignedStableGetUrl(
      filesS3Config(PROD_ENV),
      key,
      stableReadWindow(new Date(at), settings),
    );

  it("defaults to a 24 h window and a 1 h minimum validity", () => {
    expect(settings).toEqual({
      windowSeconds: DEFAULT_READ_URL_WINDOW_SECONDS,
      minValiditySeconds: DEFAULT_READ_URL_MIN_VALIDITY_SECONDS,
    });
    expect(DEFAULT_READ_URL_WINDOW_SECONDS).toBe(86_400);
    expect(DEFAULT_READ_URL_MIN_VALIDITY_SECONDS).toBe(3_600);
  });

  it("signs the same URL for the same key anywhere inside one window", async () => {
    const first = await sign(START + 1000);
    expect(await sign(START + 1000)).toBe(first);
    expect(await sign(START + 13 * HOUR)).toBe(first);
    expect(await sign(START + 24 * HOUR - 1000)).toBe(first);
  });

  it("signs a different URL in the next window, and for another key", async () => {
    const first = await sign(START + 1000);
    expect(await sign(START + 24 * HOUR)).not.toBe(first);
    expect(await sign(START + 1000, `${KEY}.other`)).not.toBe(first);
  });

  it("dates the signature at the window start and expires it window + minimum later", async () => {
    const url = new URL(await sign(START + 7 * HOUR));
    expect(url.searchParams.get("X-Amz-Date")).toBe("20261006T000000Z");
    expect(url.searchParams.get("X-Amz-Expires")).toBe(String(86_400 + 3_600));
  });

  it("always leaves at least the minimum validity, even a second before the boundary", () => {
    for (const offset of [
      0,
      1000,
      12 * HOUR,
      24 * HOUR - 1000,
      24 * HOUR - 1,
    ]) {
      const now = START + offset;
      const window = stableReadWindow(new Date(now), settings);
      const remaining = window.expiresAt.getTime() - now;
      expect(remaining).toBeGreaterThan(settings.minValiditySeconds * 1000);
      expect(remaining).toBeLessThanOrEqual(
        (settings.windowSeconds + settings.minValiditySeconds) * 1000,
      );
      expect(window.expiresAt.getTime()).toBe(
        window.requestDate.getTime() + window.expirySeconds * 1000,
      );
    }
  });

  it("signs a private, immutable Cache-Control into the URL", async () => {
    const url = new URL(await sign(START));
    expect(url.searchParams.get("response-cache-control")).toBe(
      "private, max-age=86400, immutable",
    );
    // In the query string, so inside the signature: a holder cannot edit it.
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reads the window from the environment and refuses bad values by name", () => {
    expect(
      readUrlWindowSettings({
        FILES_READ_URL_WINDOW_SECONDS: "3600",
        FILES_READ_URL_MIN_VALIDITY_SECONDS: "600",
      }),
    ).toEqual({ windowSeconds: 3600, minValiditySeconds: 600 });
    expect(() =>
      readUrlWindowSettings({ FILES_READ_URL_WINDOW_SECONDS: "1.5" }),
    ).toThrow(/FILES_READ_URL_WINDOW_SECONDS/);
    expect(() =>
      readUrlWindowSettings({ FILES_READ_URL_MIN_VALIDITY_SECONDS: "10" }),
    ).toThrow(/FILES_READ_URL_MIN_VALIDITY_SECONDS/);
    // SigV4 caps a presign at 7 days; the pair may not add up past it.
    expect(() =>
      readUrlWindowSettings({
        FILES_READ_URL_WINDOW_SECONDS: String(7 * 86_400),
      }),
    ).toThrow(/7-day/);
  });
});
