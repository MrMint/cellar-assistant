/**
 * Who may see a recipe — `packages/policy`'s `canSeeRecipe`, in the two forms
 * an actor needs it (X15 / D22).
 *
 * Recipes became private first: `recipes.privacy` (the four-branch rule) plus
 * `recipes.is_draft` (AI output its creator has not reviewed — theirs alone).
 * Every read of `recipes` outside `RecipeActor` lists many rows in one query
 * (a search, the `/recipes` index, the bar's catalog, a group's versions, an
 * item's "used in"), so it cannot ask `canSeeRecipe` row by row; it hands
 * Postgres the same rule as a `where` clause from here instead. One copy, for
 * the reason `visibility-sql.ts` gives: a branch that drifted in one reader
 * would be a recipe hidden on one screen and listed on the next.
 *
 * The scope differs from `visibility-sql.ts`'s in one place, on purpose: a
 * `system` ctx gets **shared** rows (PUBLIC, not a draft), not everything.
 * The `system` reader of recipes is the menu matcher, whose answer becomes a
 * suggestion on a *place's* menu — read by every visitor to that place — so it
 * must only ever propose a recipe everyone may open. `admin` still sees all,
 * as everywhere (§1.6). Anonymous is shared too, although every caller has
 * already refused one.
 *
 * `recipe-visibility.test.ts` runs the clause against the same fixtures
 * `canSeeRecipe` is asked about, so the two cannot disagree silently.
 */
import type { Ctx } from "@cellar-assistant/contracts";
import { isAdmin } from "@cellar-assistant/contracts";
import { type SQL, sql } from "@cellar-assistant/db/orm";
import type { Privacy, RecipeVisibility } from "@cellar-assistant/policy";
import { canSeeRecipe, isFriend } from "@cellar-assistant/policy";
import { uuidArray } from "./collection-sql.ts";
import type { DbOrTx } from "./db.ts";
import { friendshipsOf, policyFriendships } from "./visibility.ts";
import { canSeeSql, friendIdsOf } from "./visibility-sql.ts";

/** Who is asking, resolved once per query. */
export type RecipeScope =
  | { readonly kind: "everything" }
  | { readonly kind: "shared" }
  | {
      readonly kind: "viewer";
      readonly viewer: string;
      readonly friendIds: readonly string[];
    };

export const recipeScope = async (
  db: DbOrTx,
  ctx: Ctx,
): Promise<RecipeScope> => {
  if (isAdmin(ctx)) return { kind: "everything" };
  const viewer = ctx.viewerId;
  // `system` (no viewer) and anonymous: what anyone at all may see.
  if (viewer === null) return { kind: "shared" };
  return {
    kind: "viewer",
    viewer,
    friendIds: friendIdsOf(viewer, await friendshipsOf(db, viewer)),
  };
};

/**
 * `canSeeRecipe` for every row of a query, as a `where` fragment over the
 * `recipes` row aliased `alias` (`r`, by default).
 */
export const recipeVisibleSql = (scope: RecipeScope, alias = "r"): SQL => {
  const r = sql.raw(alias);
  if (scope.kind === "everything") return sql`true`;
  if (scope.kind === "shared") {
    return sql`(${r}.privacy = 'PUBLIC' and not ${r}.is_draft)`;
  }
  // `canSeeRecipe`: the creator always; anyone else only once it is not a
  // draft, and then by the four-branch rule — `canSeeSql`, written once.
  return sql`(
      ${r}.created_by_id = ${scope.viewer}::uuid
      or (not ${r}.is_draft and ${canSeeSql(
        { kind: "viewer", viewer: scope.viewer, friendIds: scope.friendIds },
        { createdBy: sql`${r}.created_by_id`, privacy: sql`${r}.privacy` },
      )})
    )`;
};

/** `exists (a visible recipe with this id)` — for a row that carries one. */
export const recipeRefVisibleSql = (scope: RecipeScope, recipeId: SQL): SQL =>
  scope.kind === "everything"
    ? sql`true`
    : sql`exists (
        select 1 from public.recipes vr
        where vr.id = ${recipeId} and ${recipeVisibleSql(scope, "vr")}
      )`;

/** The `recipes` columns `canSeeRecipe` reads. */
export type RecipeAccess = {
  readonly createdById: string | null;
  readonly privacy: Privacy;
  readonly isDraft: boolean;
};

/** `canSeeRecipe`'s argument, for `ctx`. */
export const recipeVisibility = async (
  db: DbOrTx,
  ctx: Ctx,
  access: RecipeAccess,
): Promise<RecipeVisibility> => ({
  createdById: access.createdById,
  privacy: access.privacy,
  isDraft: access.isDraft,
  viewerIsFriendOfCreator:
    // A draft is the creator's alone and a PUBLIC recipe is everyone's: the
    // friendship read only matters for FRIENDS, so skip it otherwise.
    access.privacy === "FRIENDS" && !access.isDraft
      ? isFriend(ctx, access.createdById, await policyFriendships(db, ctx))
      : false,
});

/** `canSeeRecipe(ctx, row)`, reading the friendship rows only when needed. */
export const canSeeRecipeRow = async (
  db: DbOrTx,
  ctx: Ctx,
  access: RecipeAccess,
): Promise<boolean> =>
  canSeeRecipe(ctx, await recipeVisibility(db, ctx, access));

/**
 * The subset of `ids` that `ctx` may see, as a set. Ids that name nothing and
 * ids that name a hidden recipe are both simply absent — the caller cannot
 * tell them apart, which is the point.
 */
export const visibleRecipeIds = async (
  db: DbOrTx,
  ctx: Ctx,
  ids: readonly string[],
): Promise<ReadonlySet<string>> => {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return new Set();
  const scope = await recipeScope(db, ctx);
  const { rows } = await db.execute<{ readonly id: string }>(sql`
    select r.id from public.recipes r
    where r.id = any(${uuidArray(wanted, "recipe id")})
      and ${recipeVisibleSql(scope)}
  `);
  return new Set(rows.map((row) => row.id));
};
