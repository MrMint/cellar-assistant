import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test as setup } from "@playwright/test";
import { authStatePath, readAccounts, VISUAL } from "./env.ts";
import type { Discovered } from "./routes.ts";

/**
 * Signs each sweep account in through the real `/sign-in` form once and keeps
 * its storage state for the capture projects, then looks up the ids the seed
 * does not carry. Passwords come from `VISUAL_ACCOUNTS` at runtime and are
 * never logged.
 */
for (const who of ["demo", "friend"] as const) {
  setup(`sign in: ${who}`, async ({ page }) => {
    const account = readAccounts()[who];
    if (account === undefined) {
      throw new Error(`VISUAL_ACCOUNTS has no "${who}" account`);
    }
    await page.goto("/sign-in");
    await page.locator('input[type="email"]').fill(account.email);
    await page.locator('input[type="password"]').fill(account.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), {
      timeout: 45_000,
    });
    const path = authStatePath(who);
    mkdirSync(dirname(path), { recursive: true });
    await page.context().storageState({ path });

    if (who !== "demo") return;
    const found: Discovered = {};
    const res = await page.request.post("/api/graphql", {
      headers: { origin: VISUAL.baseURL, "content-type": "application/json" },
      data: {
        query: `query { myMenuScans(first: 1) { __typename
          ... on MenuScanConnection { edges { node { id } } } } }`,
      },
    });
    expect(res.ok(), `myMenuScans: HTTP ${res.status()}`).toBe(true);
    const body = (await res.json()) as {
      data?: { myMenuScans?: { edges?: { node: { id: string } }[] } };
    };
    found.scanId = body.data?.myMenuScans?.edges?.[0]?.node.id;
    writeFileSync(
      join(VISUAL.out, ".auth", "found.json"),
      JSON.stringify(found),
    );
  });
}
