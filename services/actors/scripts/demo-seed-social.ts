/**
 * SV-C's demo-seed module (L36): the social states the recap, compare and
 * recipe screens need, on top of what `demo-seed.ts` has already made. It is
 * loaded by `demo-seed.ts` after its own steps, which calls its
 * `seed(ctx: DemoSeedContext)` (the sibling-module contract in
 * `demo-seed-data.ts`).
 *
 * What it adds, all among the fictional demo people of `demo-seed-data.ts`:
 *
 *  1. **A community pick** (MC-pick). Test Two, Maya and Omar upvote
 *     test@test.com's Negroni: three net votes from people other than its
 *     author, so its group shows the pick. Test Two and Maya also upvote the
 *     Old Fashioned: two, one short, so that group shows the "no pick yet"
 *     state.
 *  2. **Shared ratings with Test Two** (MC-compare). Test Two rates items
 *     test@test.com has rated, some close and some far apart, so the compare
 *     screen has rows in more than one kind and clears the agreement minimum.
 *
 * ## Direct writes, and why that is safe here
 *
 * Both are rows the app makes through `voteOnRecipe` and `rateItem`, and
 * `demo-seed.ts` would make them through the API as each user. This module
 * writes them through the context's database handle, the same way `demo-seed.ts` already backdates reviews. Nothing
 * downstream is skipped: the community pick and an item's score are computed
 * on read; the one derived value a vote moves in-turn, the group's canonical
 * recipe, is unchanged by these votes (each group has one demo version).
 *
 * ## Idempotent
 *
 * Every row is skipped when it already exists (a vote is unique per recipe
 * and user; a review is looked up per user and item), so a second run
 * reports `0` for both counts. A missing demo user, item or recipe is
 * reported and skipped, never invented.
 */
import type { createDb } from "@cellar-assistant/db";
import { sql } from "@cellar-assistant/db/orm";
import {
  type DemoSeedContext,
  type DemoUserKey,
  ITEMS,
  type ItemType,
  RECIPES,
  REVIEWS,
  USERS,
} from "./demo-seed-data.ts";

type Db = ReturnType<typeof createDb>;

export type SocialSeedResult = {
  readonly votes: number;
  readonly reviews: number;
  readonly skipped: readonly string[];
};

const TABLE: Record<ItemType, string> = {
  WINE: "wines",
  BEER: "beers",
  SPIRIT: "spirits",
  COFFEE: "coffees",
  SAKE: "sakes",
  TEA: "teas",
};

const COLUMN: Record<ItemType, string> = {
  WINE: "wine_id",
  BEER: "beer_id",
  SPIRIT: "spirit_id",
  COFFEE: "coffee_id",
  SAKE: "sake_id",
  TEA: "tea_id",
};

/** Recipe key → who upvotes it. Three for the pick, two for the near miss. */
const RECIPE_VOTES: readonly (readonly [string, readonly DemoUserKey[]])[] = [
  ["negroni", ["test2", "maya", "omar"]],
  ["oldfashioned", ["test2", "maya"]],
];

/**
 * How far Test Two's score sits from test@test.com's on each shared item, in
 * order: a spread from close agreement to two stars apart, so the compare
 * rows sort visibly by difference. Ten offsets, enough to clear the
 * agreement minimum (5) with rows in several kinds.
 */
const TEST2_OFFSETS: readonly number[] = [
  -2, 1.5, -1, 0.5, 0, -0.5, 1, 0, -1.5, 0.5,
];

/** Onto the half-star scale `item_reviews` accepts (0.5 … 5). */
const halfStar = (score: number): number =>
  Math.min(5, Math.max(0.5, Math.round(score * 2) / 2));

const first = async <T>(
  db: Db,
  query: ReturnType<typeof sql>,
): Promise<T | undefined> => (await db.execute(query)).rows[0] as T | undefined;

/** Called once per row: whether this run created it (`ctx.count`). */
type Tally = (step: string, created: boolean) => void;

export const seedDemoSocial = async (
  db: Db,
  tally: Tally = () => {},
): Promise<SocialSeedResult> => {
  const skipped: string[] = [];
  let votes = 0;
  let reviews = 0;

  const userIds = new Map<DemoUserKey, string>();
  for (const user of USERS) {
    const row = await first<{ id: string }>(
      db,
      sql`select id::text as id from public."user" where email = ${user.email}`,
    );
    if (row === undefined) skipped.push(`user ${user.email}`);
    else userIds.set(user.key, row.id);
  }
  const me = userIds.get("me");

  /* 1. Community pick ---------------------------------------------------- */
  for (const [recipeKey, voters] of RECIPE_VOTES) {
    const recipe = RECIPES.find((r) => r.key === recipeKey);
    const owner = recipe === undefined ? undefined : userIds.get(recipe.owner);
    const row =
      recipe === undefined || owner === undefined
        ? undefined
        : await first<{ id: string }>(
            db,
            sql`select id::text as id from public.recipes
                where created_by_id = ${owner}::uuid and name = ${recipe.name}
                order by created_at limit 1`,
          );
    if (row === undefined) {
      skipped.push(`recipe ${recipeKey}`);
      continue;
    }
    for (const voter of voters) {
      const voterId = userIds.get(voter);
      // Never the author's own vote: it would not count toward the pick.
      if (voterId === undefined || voterId === owner) continue;
      const inserted = await db.execute(sql`
        insert into public.recipe_votes (recipe_id, user_id, vote_type)
        values (${row.id}::uuid, ${voterId}::uuid, 'upvote')
        on conflict (recipe_id, user_id) do nothing
        returning id
      `);
      votes += inserted.rows.length;
      tally("recipe votes (social)", inserted.rows.length > 0);
    }
  }

  /* 2. Shared ratings with Test Two -------------------------------------- */
  const test2 = userIds.get("test2");
  if (me !== undefined && test2 !== undefined) {
    const theirs = new Set(REVIEWS.test2);
    const shared = REVIEWS.me.filter((key) => !theirs.has(key));
    let offset = 0;
    for (const key of shared) {
      if (offset >= TEST2_OFFSETS.length) break;
      const item = ITEMS.find((i) => i.key === key);
      if (item === undefined) continue;
      const table = sql.identifier(TABLE[item.type]);
      const column = sql.identifier(COLUMN[item.type]);
      const mine = await first<{ item_id: string; score: number | string }>(
        db,
        sql`select r.${column}::text as item_id, r.score
            from public.item_reviews r
            join public.${table} x on x.id = r.${column}
            where r.user_id = ${me}::uuid and x.name = ${item.name}
            order by r.updated_at desc limit 1`,
      );
      if (mine === undefined) {
        skipped.push(`review ${key}`);
        continue;
      }
      const score = halfStar(Number(mine.score) + (TEST2_OFFSETS[offset] ?? 0));
      offset += 1;
      const exists = await first<{ one: number }>(
        db,
        sql`select 1 as one from public.item_reviews
            where user_id = ${test2}::uuid and ${column} = ${mine.item_id}::uuid`,
      );
      if (exists !== undefined) {
        tally("Test Two ratings (social)", false);
        continue;
      }
      await db.execute(sql`
        insert into public.item_reviews (user_id, ${column}, score)
        values (${test2}::uuid, ${mine.item_id}::uuid, ${score})
      `);
      reviews += 1;
      tally("Test Two ratings (social)", true);
    }
  }

  return { votes, reviews, skipped };
};

/** The sibling-seed entry point `demo-seed.ts` calls (L36). */
export const seed = async (ctx: DemoSeedContext): Promise<void> => {
  const result = await seedDemoSocial(ctx.db as Db, ctx.count);
  for (const what of result.skipped) {
    console.warn(`[demo-seed-social] skipped: ${what} not found`);
  }
};
