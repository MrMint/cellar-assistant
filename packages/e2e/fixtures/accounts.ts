/**
 * The two accounts every D workstream smoke-tested with.
 *
 * `bun run db:seed` creates them, and creates them **with these exact ids** —
 * `services/actors/scripts/seed.ts` pins them, precisely because the friends spec
 * below asserts on `secondary.id`. They are the ids these accounts have had
 * since Nhost, so a database built by `migrate-users.ts` and one built by
 * `db:seed` agree.
 *
 * X2 landed: there is one `user` table, in `cellar`, and the 31 domain foreign
 * keys reference it. The rows D2 hand-inserted into `cellar.auth.users` are
 * gone along with the schema, and nothing here changed — which was the point.
 */
export const ACCOUNTS = {
  primary: {
    key: "primary",
    email: "test@test.com",
    password: "123456789",
    id: "760a436d-a0d5-491c-a45f-f63204ae9bc0",
    /** `user.name`. `userSearch(term:)` matches this and **not** the email. */
    displayName: "Test",
  },
  secondary: {
    key: "secondary",
    email: "test2@test.com",
    password: "123456789",
    id: "eed52e56-6451-47c8-86b5-1f318f0d3a99",
    displayName: "Test Two",
  },
} as const;

export type AccountKey = keyof typeof ACCOUNTS;
export type Account = (typeof ACCOUNTS)[AccountKey];

/**
 * Where the suite expects the client. **Defaults to the container, not 3000.**
 *
 * 3003 is the containerized `client` service in the shared stack; 3000 belongs
 * to the user's own `bun run dev`, all day, and `AGENTS.md` forbids an agent
 * starting or stopping it. Defaulting to 3000 therefore made the default the
 * one target an agent can never provide, so a bare `bun run test:e2e` could
 * only fail. The container is the runnable default; `E2E_BASE_URL` points the
 * suite at a host dev server when you have one:
 *
 *   bun run test:e2e                                   # the container, 3003
 *   E2E_BASE_URL=http://localhost:3000 bun run test:e2e # your own dev server
 *
 * The trade this makes, and the reason `global-setup.ts` announces the target:
 * the client container serves a **baked image**, not the working tree (unlike
 * `api`/`actors`, which bind-mount it). So editing client code and re-running
 * the suite silently tests the *previous* build until you run
 * `bun run stack:client:build`. That is a real footgun and it is the cost of
 * this default; the run banner exists so it can never be a silent one.
 */
export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3003";

/**
 * Where `global-setup.ts` parks each account's signed-in storage state.
 *
 * Relative to this package's own directory, which is Playwright's cwd — these
 * files hold live better-auth session tokens and `packages/e2e/artifacts/` is
 * gitignored on exactly that path.
 */
export const storageStatePath = (key: AccountKey): string =>
  `artifacts/state-${key}.json`;
