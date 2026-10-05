/**
 * `resolveClientIp` and the proxy-trust configuration, without better-auth:
 * header handling hop by hop. `rate-limit.test.ts` runs the same middleware in
 * front of the real limiter.
 */
import type { IncomingHttpHeaders } from "node:http";
import type express from "express";
import { describe, expect, it, vi } from "vitest";
import {
  CLIENT_IP_HEADER,
  PROXY_SECRET_HEADER,
  resolveClientIp,
  secretMatches,
  VERIFIED_PROXY_HEADER,
} from "./client-ip.ts";
import {
  MIN_PROXY_SECRET_LENGTH,
  PUBLISHED_DEV_PROXY_SECRET,
  readProxyTrust,
} from "./config.ts";
import {
  DEFAULT_SESSION_EXCHANGE_LIMIT,
  parseSessionExchangeLimit,
  sessionExchangeLimiter,
  sessionKey,
} from "./session-exchange-limit.ts";

const SECRET = "s".repeat(MIN_PROXY_SECRET_LENGTH);

/** Runs the middleware over a bare request and returns what better-auth would see. */
const resolve = (
  headers: IncomingHttpHeaders,
  remoteAddress = "10.0.0.9",
  proxySecret: string | undefined = SECRET,
): IncomingHttpHeaders => {
  const req = { headers: { ...headers }, socket: { remoteAddress } };
  let called = false;
  resolveClientIp({ proxySecret })(
    req as unknown as express.Request,
    {} as express.Response,
    () => {
      called = true;
    },
  );
  expect(called).toBe(true);
  return req.headers;
};

describe("secretMatches", () => {
  it("matches the secret and nothing else", () => {
    expect(secretMatches(SECRET, SECRET)).toBe(true);
    expect(secretMatches(`${SECRET}x`, SECRET)).toBe(false);
    expect(secretMatches("", SECRET)).toBe(false);
    expect(secretMatches(undefined, SECRET)).toBe(false);
  });

  it("never matches when no secret is configured, even an empty presentation", () => {
    expect(secretMatches("", "")).toBe(false);
    expect(secretMatches("x", undefined)).toBe(false);
  });

  it("compares different lengths without throwing (both sides are hashed)", () => {
    expect(() =>
      secretMatches("a", "a much longer secret value"),
    ).not.toThrow();
  });
});

describe("resolveClientIp", () => {
  it("keeps the proxy's claimed address when the secret checks out", () => {
    const seen = resolve({
      [PROXY_SECRET_HEADER]: SECRET,
      [CLIENT_IP_HEADER]: "203.0.113.7",
      "x-forwarded-for": "192.0.2.1",
    });
    expect(seen[CLIENT_IP_HEADER]).toBe("203.0.113.7");
    expect(seen[VERIFIED_PROXY_HEADER]).toBe("1");
  });

  it("strips the secret, so better-auth and its logs never see it", () => {
    const seen = resolve({ [PROXY_SECRET_HEADER]: SECRET });
    expect(seen[PROXY_SECRET_HEADER]).toBeUndefined();
  });

  it("replaces an unvouched claim with the nearest proxy's x-forwarded-for entry", () => {
    const seen = resolve({
      [CLIENT_IP_HEADER]: "203.0.113.7",
      "x-forwarded-for": "198.51.100.1, 192.0.2.44",
    });
    expect(seen[CLIENT_IP_HEADER]).toBe("192.0.2.44");
    expect(seen[VERIFIED_PROXY_HEADER]).toBeUndefined();
  });

  it("does not let a caller assert verification itself", () => {
    const seen = resolve({ [VERIFIED_PROXY_HEADER]: "1" });
    expect(seen[VERIFIED_PROXY_HEADER]).toBeUndefined();
  });

  it("refuses a wrong secret exactly like a missing one", () => {
    const seen = resolve({
      [PROXY_SECRET_HEADER]: "wrong",
      [CLIENT_IP_HEADER]: "203.0.113.7",
    });
    expect(seen[CLIENT_IP_HEADER]).toBe("10.0.0.9");
    expect(seen[VERIFIED_PROXY_HEADER]).toBeUndefined();
  });

  it("verifies nothing when no secret is configured", () => {
    const seen = resolve(
      { [PROXY_SECRET_HEADER]: "", [CLIENT_IP_HEADER]: "203.0.113.7" },
      "10.0.0.9",
      undefined,
    );
    expect(seen[CLIENT_IP_HEADER]).toBe("10.0.0.9");
    expect(seen[VERIFIED_PROXY_HEADER]).toBeUndefined();
  });

  it("falls back to the socket, unmapping ::ffff:", () => {
    expect(resolve({}, "::ffff:10.1.2.3")[CLIENT_IP_HEADER]).toBe("10.1.2.3");
  });

  it("ignores a vouched claim that is not an address", () => {
    const seen = resolve({
      [PROXY_SECRET_HEADER]: SECRET,
      [CLIENT_IP_HEADER]: "not-an-ip",
    });
    expect(seen[CLIENT_IP_HEADER]).toBe("10.0.0.9");
    // Still the proxy: its exchanges are still session-keyed.
    expect(seen[VERIFIED_PROXY_HEADER]).toBe("1");
  });
});

describe("readProxyTrust", () => {
  it("refuses to start in production without a secret", () => {
    expect(() => readProxyTrust({ NODE_ENV: "production" })).toThrow(
      /AUTH_PROXY_SECRET is required in production/,
    );
    expect(() =>
      readProxyTrust({ NODE_ENV: "production", AUTH_PROXY_SECRET: "" }),
    ).toThrow(/required/);
  });

  it("refuses the published development value in production", () => {
    expect(() =>
      readProxyTrust({
        NODE_ENV: "production",
        AUTH_PROXY_SECRET: PUBLISHED_DEV_PROXY_SECRET,
      }),
    ).toThrow(/published value/);
  });

  it("refuses a short secret in production", () => {
    expect(() =>
      readProxyTrust({ NODE_ENV: "production", AUTH_PROXY_SECRET: "short" }),
    ).toThrow(/at least 32/);
  });

  it("accepts a real secret in production", () => {
    expect(
      readProxyTrust({ NODE_ENV: "production", AUTH_PROXY_SECRET: SECRET })
        .proxySecret,
    ).toBe(SECRET);
  });

  it("starts without one outside production", () => {
    expect(readProxyTrust({}).proxySecret).toBeUndefined();
  });
});

describe("the per-session exchange limit", () => {
  it("parses <max>/<window> and refuses anything else", () => {
    expect(parseSessionExchangeLimit(undefined)).toEqual(
      DEFAULT_SESSION_EXCHANGE_LIMIT,
    );
    expect(parseSessionExchangeLimit("10/5")).toEqual({
      max: 10,
      windowSeconds: 5,
    });
    for (const bad of ["10", "0/5", "10/0", "ten/5", "10/5/1"]) {
      expect(() => parseSessionExchangeLimit(bad)).toThrow(
        /AUTH_SESSION_EXCHANGE_LIMIT/,
      );
    }
  });

  it("keys on the session token cookie in either spelling", () => {
    const plain = sessionKey("a=b; better-auth.session_token=tok.sig; c=d");
    const secure = sessionKey("__Secure-better-auth.session_token=tok.sig");
    expect(plain).toBeDefined();
    expect(plain).toBe(secure);
    expect(sessionKey("better-auth.state=x")).toBeUndefined();
    expect(sessionKey(undefined)).toBeUndefined();
  });

  const hit = (
    limiter: express.RequestHandler,
    headers: IncomingHttpHeaders,
    path = "/api/auth/token",
  ): number => {
    let status = 0;
    const res = {
      status(code: number) {
        status = code;
        return res;
      },
      set: () => res,
      json: () => res,
    };
    limiter(
      { path, headers } as unknown as express.Request,
      res as unknown as express.Response,
      () => {
        status = 200;
      },
    );
    return status;
  };

  it("limits a verified session, and only that session, within its window", () => {
    let clock = 0;
    const limiter = sessionExchangeLimiter(
      { max: 2, windowSeconds: 10 },
      "/api/auth",
      () => clock,
    );
    const a = {
      [VERIFIED_PROXY_HEADER]: "1",
      cookie: "better-auth.session_token=a",
    };
    const b = {
      [VERIFIED_PROXY_HEADER]: "1",
      cookie: "better-auth.session_token=b",
    };
    expect([hit(limiter, a), hit(limiter, a), hit(limiter, a)]).toEqual([
      200, 200, 429,
    ]);
    expect(hit(limiter, b)).toBe(200);
    clock = 10_000;
    expect(hit(limiter, a)).toBe(200);
  });

  it("answers a refusal with Retry-After, and reports it once per window", () => {
    let clock = 0;
    const limiter = sessionExchangeLimiter(
      { max: 1, windowSeconds: 10 },
      "/api/auth",
      () => clock,
    );
    const headers = {
      [VERIFIED_PROXY_HEADER]: "1",
      cookie: "better-auth.session_token=a",
    };
    const set: Record<string, string> = {};
    const res = {
      status: () => res,
      set(name: string, value: string) {
        set[name] = value;
        return res;
      },
      json: () => res,
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const call = () =>
        limiter(
          { path: "/api/auth/token", headers } as unknown as express.Request,
          res as unknown as express.Response,
          () => {},
        );
      call();
      clock = 4_000;
      call();
      call();
      expect(set).toEqual({ "Retry-After": "6", "X-Retry-After": "6" });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toMatch(
        /session exchange limit reached \(1\/10s\) on \/api\/auth\/token/,
      );
      clock = 10_000;
      call();
      call();
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });

  it("passes unverified requests and other paths to better-auth untouched", () => {
    const limiter = sessionExchangeLimiter(
      { max: 1, windowSeconds: 10 },
      "/api/auth",
    );
    const unverified = { cookie: "better-auth.session_token=a" };
    expect([hit(limiter, unverified), hit(limiter, unverified)]).toEqual([
      200, 200,
    ]);
    const verified = { ...unverified, [VERIFIED_PROXY_HEADER]: "1" };
    expect(
      [1, 2].map(() => hit(limiter, verified, "/api/auth/sign-in/email")),
    ).toEqual([200, 200]);
  });
});
