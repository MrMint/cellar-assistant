import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createTokenCache,
  MAX_CACHE_AGE_MS,
  sessionCacheKey,
  tokenExpiryMs,
} from "./token-cache.ts";

/** A JWT-shaped string whose payload carries `exp` (seconds). Unsigned: nothing here verifies. */
const jwtExpiring = (expSeconds: number, tag = "t"): string =>
  `eyJhbGciOiJFZERTQSJ9.${Buffer.from(
    JSON.stringify({ exp: expSeconds, sub: tag }),
  ).toString("base64url")}.sig`;

const counting = (token: string | null) => {
  let calls = 0;
  return {
    exchange: async () => {
      calls += 1;
      return token;
    },
    get calls() {
      return calls;
    },
  };
};

test("sessionCacheKey keys the session cookie's value, and nothing else", () => {
  const plain = sessionCacheKey("better-auth.session_token=abc.def");
  assert.match(plain ?? "", /^[0-9a-f]{64}$/);
  assert.equal(
    sessionCacheKey(
      "better-auth.state=x; better-auth.session_token=abc.def; better-auth.session_data=zzz",
    ),
    sessionCacheKey("better-auth.session_token=abc.def; better-auth.state=y"),
    "other better-auth cookies must not split one session across keys",
  );
  assert.notEqual(plain, sessionCacheKey("better-auth.session_token=other"));
  assert.equal(sessionCacheKey("better-auth.state=x"), null);
  assert.equal(sessionCacheKey(null), null);
});

test("tokenExpiryMs reads exp, and refuses to guess", () => {
  assert.equal(tokenExpiryMs(jwtExpiring(1_000)), 1_000_000);
  assert.equal(tokenExpiryMs("eyJ.test.token"), undefined);
  assert.equal(tokenExpiryMs("no-dots"), undefined);
  assert.equal(
    tokenExpiryMs(`a.${Buffer.from("{}").toString("base64url")}.c`),
    undefined,
  );
});

test("one exchange serves a session until the revocation window closes", async () => {
  let clock = 0;
  const cache = createTokenCache({ now: () => clock });
  const token = jwtExpiring(15 * 60);
  const actor = counting(token);

  for (let i = 0; i < 500; i += 1) {
    const { token: got } = await cache.get("k", actor.exchange);
    assert.equal(got, token);
  }
  assert.equal(actor.calls, 1);

  clock = MAX_CACHE_AGE_MS - 1;
  assert.equal((await cache.get("k", actor.exchange)).fromCache, true);
  clock = MAX_CACHE_AGE_MS;
  assert.equal((await cache.get("k", actor.exchange)).fromCache, false);
  assert.equal(actor.calls, 2);
});

test("a token is never served within the skew of its own exp", async () => {
  let clock = 0;
  const cache = createTokenCache({
    now: () => clock,
    maxAgeMs: 10 * 60_000,
    skewMs: 30_000,
  });
  const actor = counting(jwtExpiring(60)); // expires at 60s
  await cache.get("k", actor.exchange);
  clock = 29_999;
  assert.equal((await cache.get("k", actor.exchange)).fromCache, true);
  clock = 30_000;
  assert.equal((await cache.get("k", actor.exchange)).fromCache, false);
});

test("no session, a refusal, an error and an unreadable token are never cached", async () => {
  const cache = createTokenCache({ now: () => 0 });

  const anonymous = counting(jwtExpiring(900));
  await cache.get(null, anonymous.exchange);
  await cache.get(null, anonymous.exchange);
  assert.equal(anonymous.calls, 2);

  const refused = counting(null);
  await cache.get("k", refused.exchange);
  await cache.get("k", refused.exchange);
  assert.equal(refused.calls, 2);

  let failures = 0;
  const failing = async () => {
    failures += 1;
    throw new Error("429");
  };
  await assert.rejects(cache.get("k", failing));
  await assert.rejects(cache.get("k", failing));
  assert.equal(failures, 2);

  const opaque = counting("eyJ.test.token");
  await cache.get("k", opaque.exchange);
  await cache.get("k", opaque.exchange);
  assert.equal(opaque.calls, 2);
  assert.equal(cache.size, 0);
});

test("concurrent misses for one session share one exchange", async () => {
  const cache = createTokenCache({ now: () => 0 });
  let calls = 0;
  let release: (token: string) => void = () => {};
  const exchange = () => {
    calls += 1;
    return new Promise<string>((resolve) => {
      release = resolve;
    });
  };
  const pending = Array.from({ length: 12 }, () => cache.get("k", exchange));
  release(jwtExpiring(900));
  const results = await Promise.all(pending);
  assert.equal(calls, 1);
  assert.ok(results.every((r) => r.token === results[0]?.token));
});

test("evict forgets a token; sessions never share one", async () => {
  const cache = createTokenCache({ now: () => 0 });
  const a = counting(jwtExpiring(900, "a"));
  const b = counting(jwtExpiring(900, "b"));
  const ta = (await cache.get("a", a.exchange)).token;
  const tb = (await cache.get("b", b.exchange)).token;
  assert.notEqual(ta, tb);
  cache.evict("a");
  assert.equal((await cache.get("a", a.exchange)).fromCache, false);
  assert.equal((await cache.get("b", b.exchange)).fromCache, true);
});

test("the cache is bounded", async () => {
  const cache = createTokenCache({ now: () => 0, maxEntries: 3 });
  for (const key of ["a", "b", "c", "d", "e"]) {
    await cache.get(key, async () => jwtExpiring(900, key));
  }
  assert.equal(cache.size, 3);
});
