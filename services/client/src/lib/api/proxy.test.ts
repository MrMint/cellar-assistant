import assert from "node:assert/strict";
import { test } from "node:test";
import { downstreamHeaders, forwardRequest, upstreamHeaders } from "./proxy.ts";

test("forwards the headers better-auth needs and drops the rest", () => {
  const source = new Headers({
    origin: "http://localhost:3000",
    "content-type": "application/json",
    host: "localhost:3000",
    "accept-encoding": "gzip",
    authorization: "Bearer someone-elses",
    cookie: "better-auth.session_token=x",
  });

  const headers = upstreamHeaders(source, "better-auth.session_token=x");

  // Without `origin`, better-auth rejects every POST as cross-origin.
  assert.equal(headers.get("origin"), "http://localhost:3000");
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("cookie"), "better-auth.session_token=x");
  assert.equal(headers.get("host"), null);
  assert.equal(headers.get("accept-encoding"), null);
  // A client-supplied Authorization must never reach an upstream that trusts it.
  assert.equal(headers.get("authorization"), null);
});

test("omits Cookie entirely when there is nothing to send", () => {
  const headers = upstreamHeaders(new Headers({ accept: "*/*" }), null);
  assert.equal(headers.has("cookie"), false);
});

test("preserves every Set-Cookie, which sign-out returns three of", () => {
  const upstream = new Headers();
  upstream.append(
    "set-cookie",
    "better-auth.session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
  );
  upstream.append("set-cookie", "better-auth.session_data=; Max-Age=0; Path=/");
  upstream.append(
    "set-cookie",
    "better-auth.dont_remember=; Max-Age=0; Path=/",
  );
  upstream.set("content-type", "application/json");
  upstream.set("content-encoding", "gzip");

  const headers = downstreamHeaders(upstream);

  assert.equal(headers.getSetCookie().length, 3);
  assert.equal(headers.get("content-type"), "application/json");
  // `fetch` already decoded the body; keeping the framing headers would
  // describe a body that no longer exists.
  assert.equal(headers.get("content-encoding"), null);
});

test("does not follow redirects — the browser must see the 302", async () => {
  const seen: RequestInit[] = [];
  const fetchImpl = async (_url: string, init: RequestInit) => {
    seen.push(init);
    return new Response(null, {
      status: 302,
      headers: { location: "https://accounts.google.com/o/oauth2/auth?x=1" },
    });
  };

  const response = await forwardRequest({
    request: new Request("http://localhost:3000/api/auth/sign-in/social", {
      method: "POST",
      body: "{}",
    }),
    targetUrl: "http://localhost:3002/api/auth/sign-in/social",
    fetchImpl,
  });

  assert.equal(seen[0]?.redirect, "manual");
  assert.equal(seen[0]?.cache, "no-store");
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location") ?? "", /accounts\.google\.com/);
});

test("filters the request's own cookies when none is supplied", async () => {
  let sentCookie: string | null = null;
  const fetchImpl = async (_url: string, init: RequestInit) => {
    sentCookie = new Headers(init.headers).get("cookie");
    return new Response("{}", { status: 200 });
  };

  await forwardRequest({
    request: new Request("http://localhost:3000/api/auth/get-session", {
      headers: { cookie: "nhostSession=leak; better-auth.session_token=keep" },
    }),
    targetUrl: "http://localhost:3002/api/auth/get-session",
    fetchImpl,
  });

  assert.equal(sentCookie, "better-auth.session_token=keep");
});
