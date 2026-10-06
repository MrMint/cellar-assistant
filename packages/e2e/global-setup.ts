import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { request } from "@playwright/test";
import { ACCOUNTS, BASE_URL, storageStatePath } from "./fixtures/accounts.ts";

/**
 * Mint a signed-in storage state per account **over HTTP, not through the UI**.
 *
 * Deliberate: `specs/01-sign-in.spec.ts` is the test of the sign-in *page*. If
 * global setup drove that page too, a broken sign-in form would abort the whole
 * run and the report would say nothing about the other twelve flows.
 *
 * For the same reason this **does not throw** when sign-in fails. A global
 * setup that throws produces zero test results and a single stack trace, which
 * is the least informative thing a suite can do. Instead it writes an empty
 * storage state and lets `specs/00-preflight.spec.ts` report the failure as one
 * named test — while the checks that need no stack at all (the client-boundary
 * guard) still run and still say something useful.
 *
 * `Origin` is not optional — better-auth answers `MISSING_OR_NULL_ORIGIN` (403)
 * without it, which is its CSRF check doing its job.
 */
const EMPTY_STATE = { cookies: [], origins: [] };

async function mint(email: string, password: string, path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const ctx = await request.newContext({ baseURL: BASE_URL });
  try {
    const res = await ctx.post("/api/auth/sign-in/email", {
      headers: { origin: BASE_URL, "content-type": "application/json" },
      data: { email, password, rememberMe: true },
    });
    if (!res.ok()) {
      console.error(
        `[e2e] sign-in failed for ${email}: ${res.status()} ${(await res.text()).slice(0, 200)}`,
      );
      writeFileSync(path, JSON.stringify(EMPTY_STATE));
      return;
    }
    writeFileSync(path, JSON.stringify(await ctx.storageState(), null, 2));
  } catch (error) {
    console.error(
      `[e2e] sign-in for ${email} could not reach the app: ${error}`,
    );
    writeFileSync(path, JSON.stringify(EMPTY_STATE));
  } finally {
    await ctx.dispose();
  }
}

/**
 * Say which app is about to be tested, once, before anything runs.
 *
 * The default target is the containerized client, which serves a **baked
 * image** rather than the working tree — so a client edit is invisible to this
 * suite until `bun run stack:client:build` runs. Every other service in the
 * stack bind-mounts the worktree and is live, which makes the exception easy to
 * forget and expensive to rediscover: the suite passes, and it passed against
 * the previous build. Naming the target in the log means a stale-image run can
 * be recognised in a report afterwards instead of being mistaken for a verdict
 * on the code in front of you.
 */
function announceTarget(): void {
  const explicit = process.env.E2E_BASE_URL !== undefined;
  console.log(`[e2e] target ${BASE_URL}${explicit ? " (E2E_BASE_URL)" : ""}`);
  if (!explicit) {
    console.log(
      "[e2e] this is the containerized client, which serves a baked image — " +
        "run `bun run stack:client:build` after changing services/client, or " +
        "set E2E_BASE_URL=http://localhost:3000 to drive your own dev server.",
    );
  }
}

export default async function globalSetup() {
  announceTarget();
  for (const account of Object.values(ACCOUNTS)) {
    await mint(
      account.email,
      account.password,
      storageStatePath(account.key as keyof typeof ACCOUNTS),
    );
  }
}
