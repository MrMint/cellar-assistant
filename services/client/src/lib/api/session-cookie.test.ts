import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authCookieHeaderFrom,
  hasSessionCookie,
  isAuthCookieName,
  parseCookieHeader,
} from "./session-cookie.ts";

test("recognises both the plain and __Secure- cookie spellings", () => {
  assert.ok(isAuthCookieName("better-auth.session_token"));
  assert.ok(isAuthCookieName("__Secure-better-auth.session_token"));
  assert.ok(isAuthCookieName("better-auth.state"));
  assert.equal(isAuthCookieName("nhostSession"), false);
});

test("parses a Cookie header without decoding values", () => {
  // The session token is percent-encoded on the wire; decoding here and
  // re-serialising would hand better-auth a different string than the browser
  // sent.
  const entries = parseCookieHeader(
    "better-auth.session_token=abc.def%3D; x=1",
  );
  assert.deepEqual(entries, [
    { name: "better-auth.session_token", value: "abc.def%3D" },
    { name: "x", value: "1" },
  ]);
});

test("drops malformed pairs rather than inventing valueless cookies", () => {
  assert.deepEqual(parseCookieHeader("novalue; =orphan; a=b"), [
    { name: "a", value: "b" },
  ]);
  assert.deepEqual(parseCookieHeader(null), []);
  assert.deepEqual(parseCookieHeader(""), []);
});

test("forwards only better-auth cookies, never the Nhost session", () => {
  const header = authCookieHeaderFrom(
    'nhostSession={"accessToken":"secret"}; better-auth.session_token=t%3D; _vercel_jwt=x; better-auth.state=s',
  );
  assert.equal(header, "better-auth.session_token=t%3D; better-auth.state=s");
  assert.ok(header !== null && !header.includes("nhostSession"));
});

test("returns null rather than an empty header when nothing matches", () => {
  assert.equal(authCookieHeaderFrom("nhostSession=x"), null);
  assert.equal(authCookieHeaderFrom(null), null);
});

test("hasSessionCookie ignores the other better-auth cookies", () => {
  assert.equal(
    hasSessionCookie(parseCookieHeader("better-auth.state=s")),
    false,
  );
  assert.equal(
    hasSessionCookie(parseCookieHeader("__Secure-better-auth.session_token=s")),
    true,
  );
});
