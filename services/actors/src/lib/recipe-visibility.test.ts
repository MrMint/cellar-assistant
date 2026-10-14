/**
 * `./recipe-visibility.ts` against real rows: the SQL clause and the pure
 * `canSeeRecipe` must give the same answer for every viewer and every
 * privacy/draft combination — and `system` must see shared rows only.
 */
import {
  adminCtx,
  anonymousCtx,
  type Ctx,
  systemCtx,
  userCtx,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import {
  canSeeRecipe,
  isFriend,
  PRIVACY_VALUES,
} from "@cellar-assistant/policy";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "./db.ts";
import {
  canSeeRecipeRow,
  recipeRefVisibleSql,
  recipeScope,
  recipeVisibleSql,
  visibleRecipeIds,
} from "./recipe-visibility.ts";
import { seedFriendship, seedRecipe } from "./search-testing.ts";
import {
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "./testing.ts";
import { friendshipsOf } from "./visibility.ts";

const { skip } = await resolveTestDatabase();

type Fixture = {
  readonly id: string;
  readonly privacy: (typeof PRIVACY_VALUES)[number];
  readonly isDraft: boolean;
};

const seedAll = async (db: DbOrTx, owner: string): Promise<Fixture[]> => {
  const rows: Fixture[] = [];
  for (const privacy of PRIVACY_VALUES) {
    for (const isDraft of [false, true]) {
      rows.push({
        id: await seedRecipe(db, {
          name: `${privacy}-${isDraft}`,
          createdById: owner,
          privacy,
          isDraft,
        }),
        privacy,
        isDraft,
      });
    }
  }
  return rows;
};

const sqlVisible = async (
  db: DbOrTx,
  ctx: Ctx,
  ids: readonly string[],
): Promise<Set<string>> => {
  const scope = await recipeScope(db, ctx);
  const { rows } = await db.execute<{ id: string }>(sql`
    select r.id from public.recipes r
    where r.id in (${sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`, `,
    )}) and ${recipeVisibleSql(scope)}
  `);
  return new Set(rows.map((row) => row.id));
};

describe.skipIf(skip)("recipe visibility (X15 / D22)", () => {
  afterAll(closeTestDb);

  it("the SQL clause agrees with canSeeRecipe for owner, friend, stranger and admin", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const friend = await seedUser(db);
      const stranger = await seedUser(db);
      const admin = await seedUser(db);
      await seedFriendship(db, owner, friend);
      const fixtures = await seedAll(db, owner);
      const ids = fixtures.map((row) => row.id);

      for (const [label, ctx] of [
        ["owner", userCtx(owner, "r")],
        ["friend", userCtx(friend, "r")],
        ["stranger", userCtx(stranger, "r")],
        ["admin", adminCtx(admin, "r")],
      ] as const) {
        const viewer = ctx.viewerId ?? "";
        const friendships = await friendshipsOf(db, viewer);
        const seen = await sqlVisible(db, ctx, ids);
        const helper = await visibleRecipeIds(db, ctx, ids);
        for (const row of fixtures) {
          const expected = canSeeRecipe(ctx, {
            createdById: owner,
            privacy: row.privacy,
            isDraft: row.isDraft,
            viewerIsFriendOfCreator: isFriend(ctx, owner, friendships),
          });
          const what = `${label} ${row.privacy} draft=${row.isDraft}`;
          expect(seen.has(row.id), what).toBe(expected);
          expect(helper.has(row.id), what).toBe(expected);
          expect(
            await canSeeRecipeRow(db, ctx, {
              createdById: owner,
              privacy: row.privacy,
              isDraft: row.isDraft,
            }),
            what,
          ).toBe(expected);
        }
      }
    });
  });

  it("system and anonymous see shared rows only — PUBLIC and published", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const fixtures = await seedAll(db, owner);
      const ids = fixtures.map((row) => row.id);
      const shared = fixtures
        .filter((row) => row.privacy === "PUBLIC" && !row.isDraft)
        .map((row) => row.id);
      for (const ctx of [systemCtx("r"), anonymousCtx("r")]) {
        expect([...(await sqlVisible(db, ctx, ids))]).toEqual(shared);
      }
    });
  });

  it("recipeRefVisibleSql follows the same rule for a row that carries a recipe id", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const stranger = await seedUser(db);
      const privateId = await seedRecipe(db, {
        name: "Mine",
        createdById: owner,
        privacy: "PRIVATE",
      });
      const publicId = await seedRecipe(db, {
        name: "Ours",
        createdById: owner,
        privacy: "PUBLIC",
      });
      const scope = await recipeScope(db, userCtx(stranger, "r"));
      for (const [id, expected] of [
        [privateId, false],
        [publicId, true],
      ] as const) {
        const { rows } = await db.execute<{ ok: boolean }>(
          sql`select ${recipeRefVisibleSql(scope, sql`${id}::uuid`)} as ok`,
        );
        expect(rows[0]?.ok).toBe(expected);
      }
    });
  });
});
