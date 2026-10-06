/**
 * `src/proxy.ts`'s daily session check (`session-check.ts`), driven through
 * the real proxy function with the actor host played by a stubbed `fetch`.
 *
 * The contract: a page request with a session cookie and no
 * `cellar.session_checked` marker reads `/get-session` once, relays only the
 * session cookies better-auth re-issued, and sets the marker; the next
 * request carries the marker and costs nothing; and a get-session that fails
 * still serves the page. `services/actors/src/auth/proxy-session-check.test.ts`
 * runs the same check against the real better-auth.
 *
 * Lives under `src/lib/` rather than beside `src/proxy.ts` because the client
 * suite runs `src/lib/` and `src/utilities/` only (`package.json`), and a test
 * at `src/proxy.test.ts` would never run.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy.ts";
import { authOrigin } from "./config.ts";
import { AUTH_BASE_PATH } from "./endpoints.ts";
import { PROXY_SECRET_HEADER } from "./proxy-secret.ts";
import {
  CHECKED_MAX_AGE_SECONDS,
  checkSession,
  RETRY_AFTER_FAILURE_SECONDS,
  SESSION_CHECKED_COOKIE,
} from "./session-check.ts";

const GET_SESSION_URL = `${authOrigin()}${AUTH_BASE_PATH}/get-session`;
const SESSION = "better-auth.session_token=abc.def";
const SECRET = "proxy-secret-for-this-test-only-000000000000";
const REISSUED =
  "better-auth.session_token=abc.def; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax";

type Call = { url: string; headers: Headers };

const realFetch = globalThis.fetch;
const savedSecret = process.env.AUTH_PROXY_SECRET;
let calls: Call[] = [];

/** The actor host answers get-session with `answer()`. */
const stubActorHost = (answer: () => Response | Promise<Response>) => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return answer();
  }) as typeof fetch;
};

beforeEach(() => {
  calls = [];
  process.env.AUTH_PROXY_SECRET = SECRET;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  if (savedSecret === undefined) delete process.env.AUTH_PROXY_SECRET;
  else process.env.AUTH_PROXY_SECRET = savedSecret;
});

const page = (cookie: string | null, url = "http://localhost:3000/cellars") =>
  new NextRequest(url, { headers: cookie === null ? {} : { cookie } });

/** What a browser would send next: its old cookies plus whatever was set. */
const cookieJarAfter = (before: string, setCookies: string[]): string => {
  const jar = new Map(
    before.split("; ").map((pair) => {
      const at = pair.indexOf("=");
      return [pair.slice(0, at), pair.slice(at + 1)] as const;
    }),
  );
  for (const setCookie of setCookies) {
    const [pair = ""] = setCookie.split(";");
    const at = pair.indexOf("=");
    jar.set(pair.slice(0, at), pair.slice(at + 1));
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
};

const markerOf = (setCookies: string[]) =>
  setCookies.find((c) => c.startsWith(`${SESSION_CHECKED_COOKIE}=`));

describe("the proxy's daily session check", () => {
  test("relays the refreshed cookie once, sets the marker, and the next request skips", async () => {
    stubActorHost(() => {
      const headers = new Headers({ "content-type": "application/json" });
      headers.append("set-cookie", REISSUED);
      // Not a session cookie: better-auth's, but not ours to relay here.
      headers.append(
        "set-cookie",
        "better-auth.state=xyz; Max-Age=600; Path=/; HttpOnly",
      );
      headers.append("set-cookie", "tracker=1; Path=/");
      return new Response(JSON.stringify({ session: {}, user: {} }), {
        status: 200,
        headers,
      });
    });

    const cookie = `${SESSION}; analytics=zzz`;
    const first = await proxy(page(cookie));
    assert.equal(first.headers.get("location"), null, "not redirected");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, GET_SESSION_URL);
    // Only better-auth's cookies go to the actor host, with the secret.
    assert.equal(calls[0]?.headers.get("cookie"), SESSION);
    assert.equal(calls[0]?.headers.get(PROXY_SECRET_HEADER), SECRET);

    const set = first.headers.getSetCookie();
    assert.ok(set.includes(REISSUED), "the re-issued cookie, verbatim");
    assert.ok(!set.some((c) => c.startsWith("better-auth.state=")));
    assert.ok(!set.some((c) => c.startsWith("tracker=")));
    const marker = markerOf(set) ?? "";
    assert.match(marker, new RegExp(`Max-Age=${CHECKED_MAX_AGE_SECONDS}\\b`));
    assert.match(marker, /HttpOnly/);
    assert.match(marker, /SameSite=Lax/);
    assert.match(marker, /Path=\//);
    assert.doesNotMatch(marker, /Secure/, "plain http: no Secure");
    assert.equal(first.headers.get("cache-control"), "no-store");

    const second = await proxy(page(cookieJarAfter(cookie, set)));
    assert.equal(calls.length, 1, "the marker skips the check");
    assert.deepEqual(second.headers.getSetCookie(), []);
    assert.equal(second.headers.get("location"), null);
  });

  test("a get-session that throws still serves the page, and retries soon", async () => {
    stubActorHost(() => {
      throw new TypeError("fetch failed");
    });
    const response = await proxy(page(SESSION));
    assert.equal(calls.length, 1);
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("x-middleware-next"), "1");
    const set = response.headers.getSetCookie();
    assert.equal(set.length, 1, "no session cookie relayed");
    assert.match(
      markerOf(set) ?? "",
      new RegExp(`Max-Age=${RETRY_AFTER_FAILURE_SECONDS}\\b`),
    );
  });

  test("a 5xx still serves the page, and retries soon", async () => {
    stubActorHost(() => new Response("boom", { status: 503 }));
    const response = await proxy(page(SESSION));
    assert.equal(response.headers.get("x-middleware-next"), "1");
    assert.match(
      markerOf(response.headers.getSetCookie()) ?? "",
      new RegExp(`Max-Age=${RETRY_AFTER_FAILURE_SECONDS}\\b`),
    );
  });

  test("a hung actor host is abandoned, not waited on", async () => {
    const started = Date.now();
    const result = await checkSession({
      authOrigin: authOrigin(),
      cookieHeader: SESSION,
      secure: false,
      timeoutMs: 50,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
    });
    assert.ok(Date.now() - started < 1_000);
    assert.match(
      result.join("\n"),
      new RegExp(`Max-Age=${RETRY_AFTER_FAILURE_SECONDS}\\b`),
    );
  });

  test("a refused session is relayed (the clear) and counts as checked", async () => {
    const cleared = "better-auth.session_token=; Max-Age=0; Path=/; HttpOnly";
    stubActorHost(
      () =>
        new Response(null, { status: 401, headers: { "set-cookie": cleared } }),
    );
    const set = (await proxy(page(SESSION))).headers.getSetCookie();
    assert.ok(set.includes(cleared));
    assert.match(
      markerOf(set) ?? "",
      new RegExp(`Max-Age=${CHECKED_MAX_AGE_SECONDS}\\b`),
    );
  });

  test("the marker is Secure over https", async () => {
    stubActorHost(() => Response.json(null));
    const response = await proxy(
      page(SESSION, "https://cellar.example/cellars"),
    );
    assert.match(markerOf(response.headers.getSetCookie()) ?? "", /; Secure/);
  });

  test("no session cookie: redirected, never checked", async () => {
    stubActorHost(() => Response.json(null));
    const response = await proxy(page("analytics=zzz"));
    assert.equal(calls.length, 0);
    assert.match(response.headers.get("location") ?? "", /\/sign-in/);
  });

  test("static files and auth pages are never checked", async () => {
    stubActorHost(() => Response.json(null));
    for (const url of [
      "http://localhost:3000/manifest.json",
      "http://localhost:3000/_next/static/chunks/app.js",
      "http://localhost:3000/sign-in",
    ]) {
      const response = await proxy(page(SESSION, url));
      assert.deepEqual(response.headers.getSetCookie(), [], url);
    }
    assert.equal(calls.length, 0);
  });
});
