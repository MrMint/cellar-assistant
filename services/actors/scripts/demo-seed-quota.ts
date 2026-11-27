/**
 * redesign-2026-11 SV-A (L36): AI-allowance usage for the demo user, so the
 * quota states a later wave screenshots have data behind them —
 *
 *  - `ai_model/tier_list_insights` partly used: "n left" (300 of 1,500).
 *  - `ai_model/recipe_photo` used up: "Limit reached", naming the reset.
 *
 * `demo-seed.ts` (SV-B's) calls {@link seed} with its `DemoSeedContext`. Writes only `api_usage_log` rows, each
 * marked `metadata.demoSeed`, and deletes its own earlier rows first, so a
 * re-run leaves the same counts rather than doubling them.
 *
 * The numbers assume the default period (a UTC calendar month) and default
 * caps: a kind's period allowance is ten of its days (`periodLimit` in
 * `budget-actor.ts`) — 150/day → 1,500 for insights, 60/day → 600 for recipe
 * photos. The rows sit at the period's first seconds, so they count against
 * the period and, except on the 1st, against no rolling hour or day: the
 * demo user can still generate Insights while seeing "300 left".
 */
import type { createDb } from "@cellar-assistant/db";
import { sql } from "@cellar-assistant/db/orm";
import type { DemoUserKey } from "./demo-seed-data.ts";

type Db = ReturnType<typeof createDb>;

/**
 * Structurally identical to `DemoSeedContext` in SV-B's `demo-seed-data.ts`
 * (`claude/redesign-2026-11-sv-b` @ dca7e53b), declared here because that
 * branch is not on this one's base yet. At merge, replace it with
 * `import type { DemoSeedContext } from "./demo-seed-data.ts"`.
 */
type DemoSeedContext = {
  readonly db: unknown;
  readonly userId: (k: DemoUserKey) => string;
  readonly cellarId: (key: string) => string;
  readonly itemId: (key: string) => string;
  readonly demoId: (key: string) => string;
  readonly graphql: (
    as: DemoUserKey,
    query: string,
    variables: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  readonly count: (step: string, created: boolean) => void;
};

/** Seeded period usage per kind, by endpoint under `ai_model`. */
export const DEMO_QUOTA_USAGE: Readonly<Record<string, number>> = {
  tier_list_insights: 1_200,
  recipe_photo: 600,
};

/** L36's entry point: the demo user ("me") gets the usage above. */
export async function seed(ctx: DemoSeedContext): Promise<void> {
  await seedDemoQuota(ctx.db as Db, ctx.userId("me"));
  // Replaced each run rather than kept, so "created" every time.
  ctx.count("ai quota usage", true);
}

/** The rows themselves, for one user. Idempotent. */
export async function seedDemoQuota(db: Db, userId: string): Promise<void> {
  await db.execute(sql`
    delete from api_usage_log
     where triggered_by = ${userId}::uuid
       and service = 'ai_model'
       and metadata ->> 'demoSeed' = 'true'
  `);
  for (const [endpoint, count] of Object.entries(DEMO_QUOTA_USAGE)) {
    await db.execute(sql`
      insert into api_usage_log
        (service, endpoint, estimated_cost_cents, triggered_by, metadata, created_at)
      select 'ai_model', ${endpoint}, 0, ${userId}::uuid,
             jsonb_build_object('demoSeed', true),
             (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC')
               + make_interval(secs => n)
        from generate_series(1, ${count}::int) as n
    `);
  }
}
