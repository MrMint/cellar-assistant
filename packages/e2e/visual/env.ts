import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The visual sweep's inputs, all from the environment so nothing about one
 * stack (its URL, its accounts, its seeded ids) is committed:
 *
 *   VISUAL_BASE_URL  the client to sweep (default http://localhost:3303, the
 *                    integration lane; E2E_BASE_URL is honoured as a fallback)
 *   VISUAL_ACCOUNTS  path to a JSON file `{ "demo": { "email", "password" },
 *                    "friend": { … } }` — read at runtime, never printed
 *   VISUAL_SEED      path to the lane's seed JSON (`ux-lane-seed.json`): the
 *                    ids every route is built from
 *   VISUAL_OUT       where screenshots and JSON go (default
 *                    `artifacts/visual/<VISUAL_TREE>`, gitignored)
 *   VISUAL_TREE      a label for the tree the client was built from — the
 *                    short sha. A number is evidence only with its tree
 *                    (AGENTS.md), so it is written into every summary.
 *   VISUAL_SLICES    comma list (`S4,S5`) to sweep only those slices' routes
 *   VISUAL_MASK=1    mask the volatile regions (map canvas, timestamps,
 *                    avatars, AI text) — for pixel-diff baselines; off by
 *                    default so a contact sheet shows the real page
 *   VISUAL_GATE=1    the acceptance gate for a converted slice (§5.3/§5.4):
 *                    fail a route with a serious/critical axe violation or a
 *                    page wider than its viewport (default: record only —
 *                    the Joy-era baseline has hundreds of axe violations)
 */
const HERE = dirname(fileURLToPath(import.meta.url));
export const E2E_ROOT = resolve(HERE, "..");

const tree = process.env.VISUAL_TREE ?? "unlabelled";

export const VISUAL = {
  baseURL:
    process.env.VISUAL_BASE_URL ??
    process.env.E2E_BASE_URL ??
    "http://localhost:3303",
  tree,
  out: resolve(
    E2E_ROOT,
    process.env.VISUAL_OUT ?? join("artifacts", "visual", tree),
  ),
  accountsPath: process.env.VISUAL_ACCOUNTS ?? "",
  seedPath: process.env.VISUAL_SEED ?? "",
  slices: (process.env.VISUAL_SLICES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== ""),
  mask: process.env.VISUAL_MASK === "1",
  gate: process.env.VISUAL_GATE === "1",
} as const;

export const authStatePath = (who: string): string =>
  join(VISUAL.out, ".auth", `${who}.json`);
export const dataDir = (): string => join(VISUAL.out, "data");

const readJson = <T>(path: string, what: string): T => {
  if (path === "" || !existsSync(path)) {
    throw new Error(
      `the visual sweep needs ${what}: set ${
        what === "accounts" ? "VISUAL_ACCOUNTS" : "VISUAL_SEED"
      } to its path (got ${JSON.stringify(path)})`,
    );
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
};

export type Account = { email: string; password: string };
export const readAccounts = (): Record<string, Account> =>
  readJson(VISUAL.accountsPath, "accounts");
export const readSeedFile = <T>(): T => readJson<T>(VISUAL.seedPath, "seed");
