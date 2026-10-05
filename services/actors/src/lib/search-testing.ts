/**
 * Fixtures shared by C1's ten search-actor suites.
 *
 * `src/lib/testing.ts` (A4) gives every suite a rolled-back transaction and a
 * `seedUser`. These are the rows a *search* needs on top of that, and they live
 * together because `places`, `category_vectors` and `tier_list_items` are all
 * **empty** in this development database: A3b's differential test of the four
 * ported search functions was therefore functional only, and every ranking
 * claim C1 makes rests on fixtures built here.
 *
 * The vectors are deliberately axis-aligned unit vectors. Cosine distance
 * between two distinct axes is exactly 1, and between an axis and itself
 * exactly 0, so a ranking assertion can name the expected *order* and the
 * expected *distance* without floating-point hand-waving — which is what turns
 * "the query returned rows" into "the query ranked them correctly".
 */
import { randomUUID } from "node:crypto";
import type { ItemRef, ItemType } from "@cellar-assistant/contracts";
import { getTableName, sql } from "@cellar-assistant/db/orm";
import type { DbOrTx } from "./db.ts";
import { ARCS } from "./item-arcs.ts";
import { ITEM_TABLES } from "./item-bindings.ts";
import { toVectorLiteral } from "./vectors.ts";

export const EMBEDDING_DIMENSIONS = 768;

/** A unit vector on one axis. Distance 0 to itself, 1 to any other axis. */
export const unitVector = (axis: number): number[] =>
  Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === axis ? 1 : 0));

/**
 * A vector `angle` of the way from axis `a` towards axis `b`, so a fixture can
 * place items at *known intermediate* distances and assert a strict ordering
 * rather than a two-bucket one.
 */
export const blendedVector = (
  a: number,
  b: number,
  towardsB: number,
): number[] => {
  const v = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  v[a] = Math.cos((towardsB * Math.PI) / 2);
  v[b] = Math.sin((towardsB * Math.PI) / 2);
  return v;
};

/** The production literal (`./vectors.ts`), under the name the suites use. */
export const vectorLiteral = toVectorLiteral;

/**
 * A Postgres array *literal*. Drizzle's `sql` flattens a JS array into one
 * parameter per element, which reaches `text[]` as a scalar and fails with
 * "malformed array literal" — so arrays are always passed as one string.
 */
export const pgTextArray = (values: readonly string[]): string =>
  `{${values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;

/* -------------------------------------------------------------------------- */
/* Items                                                                       */
/* -------------------------------------------------------------------------- */

/** `wines` needs an `item_onboardings` parent and a `wine_style` value. */
export const seedWine = async (
  db: DbOrTx,
  createdById: string,
  name = "Test Wine",
): Promise<ItemRef> => {
  await db.execute(
    sql`insert into public.wine_style (value) values ('RED') on conflict do nothing`,
  );
  const onboardingId = randomUUID();
  await db.execute(sql`
    insert into public.item_onboardings (id, user_id, item_type)
    values (${onboardingId}::uuid, ${createdById}::uuid, 'WINE')
  `);
  const id = randomUUID();
  await db.execute(sql`
    insert into public.wines (id, name, created_by_id, vintage, style, item_onboarding_id)
    values (${id}::uuid, ${name}, ${createdById}::uuid, '2020-01-01', 'RED',
            ${onboardingId}::uuid)
  `);
  return { type: "WINE", id };
};

export const seedBeer = async (
  db: DbOrTx,
  createdById: string,
  name = "Test Beer",
): Promise<ItemRef> => {
  const onboardingId = randomUUID();
  await db.execute(sql`
    insert into public.item_onboardings (id, user_id, item_type)
    values (${onboardingId}::uuid, ${createdById}::uuid, 'BEER')
  `);
  const id = randomUUID();
  await db.execute(sql`
    insert into public.beers (id, name, created_by_id, item_onboarding_id)
    values (${id}::uuid, ${name}, ${createdById}::uuid, ${onboardingId}::uuid)
  `);
  return { type: "BEER", id };
};

export const seedItemVector = async (
  db: DbOrTx,
  ref: ItemRef,
  vector: readonly number[],
): Promise<void> => {
  await db.execute(sql`
    insert into public.item_vectors (${ARCS.itemVectors.unqualified(ref.type)}, vector)
    values (${ref.id}::uuid, ${vectorLiteral(vector)}::halfvec)
  `);
};

/* -------------------------------------------------------------------------- */
/* Friendship                                                                  */
/* -------------------------------------------------------------------------- */

/** One row, one direction — B4's note: `isFriend` matches either way. */
export const seedFriendship = async (
  db: DbOrTx,
  userId: string,
  friendId: string,
): Promise<void> => {
  await db.execute(sql`
    insert into public.friends (user_id, friend_id)
    values (${userId}::uuid, ${friendId}::uuid)
    on conflict do nothing
  `);
};

/* -------------------------------------------------------------------------- */
/* Cellars                                                                     */
/* -------------------------------------------------------------------------- */

export const seedCellar = async (
  db: DbOrTx,
  options: {
    readonly createdById: string;
    readonly privacy?: "PUBLIC" | "FRIENDS" | "PRIVATE";
    readonly name?: string;
    readonly coOwnerIds?: readonly string[];
  },
): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.cellars (id, name, created_by_id, privacy)
    values (${id}::uuid, ${options.name ?? "Cellar"},
            ${options.createdById}::uuid,
            ${options.privacy ?? "PRIVATE"}::permission_type)
  `);
  for (const userId of options.coOwnerIds ?? []) {
    await db.execute(sql`
      insert into public.cellar_owners (cellar_id, user_id)
      values (${id}::uuid, ${userId}::uuid)
    `);
  }
  return id;
};

/** One `cellar_items` row pointing at `ref`. Returns the cellar item id. */
export const seedCellarItem = async (
  db: DbOrTx,
  cellarId: string,
  createdBy: string,
  ref: ItemRef,
): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.cellar_items
      (id, cellar_id, created_by, ${ARCS.cellarItems.unqualified(ref.type)})
    values (${id}::uuid, ${cellarId}::uuid, ${createdBy}::uuid, ${ref.id}::uuid)
  `);
  return id;
};

/* -------------------------------------------------------------------------- */
/* Places, tier lists                                                          */
/* -------------------------------------------------------------------------- */

export type SeedPlaceInput = {
  readonly name: string;
  readonly lng: number;
  readonly lat: number;
  /** Becomes `categories[1]`, which is what the generated `primary_category` is. */
  readonly primaryCategory?: string;
  readonly extraCategories?: readonly string[];
  readonly rating?: number | null;
  readonly locality?: string | null;
  readonly isActive?: boolean;
  readonly confidence?: number;
};

/**
 * A `places` row. `places` is **empty** in this development database, so every
 * ranking assertion C1 makes rests on rows built here.
 *
 * Two columns are deliberately not written: `primary_category` is
 * `GENERATED ALWAYS AS (categories[1])`, and `search_text` is filled by the
 * `trg_places_search_text` trigger (`setweight(name,'A') || categories 'B' ||
 * locality 'C'`). Writing either by hand would make the fixture disagree with
 * production in exactly the way that hides a ranking bug.
 */
export const seedPlace = async (
  db: DbOrTx,
  input: SeedPlaceInput,
): Promise<string> => {
  const id = randomUUID();
  const categories = [
    input.primaryCategory ?? "bar",
    ...(input.extraCategories ?? []),
  ];
  await db.execute(sql`
    insert into public.places
      (id, name, location, categories, confidence, rating, locality, is_active, source)
    values (
      ${id}::uuid,
      ${input.name},
      st_setsrid(st_makepoint(${input.lng}, ${input.lat}), 4326)::geography,
      ${pgTextArray(categories)}::text[],
      ${input.confidence ?? 0.9},
      ${input.rating ?? null},
      ${input.locality ?? null},
      ${input.isActive ?? true},
      'user'
    )
  `);
  return id;
};

export const seedTierList = async (
  db: DbOrTx,
  input: {
    readonly createdById: string;
    readonly privacy?: "PUBLIC" | "FRIENDS" | "PRIVATE";
    readonly name?: string;
  },
): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.tier_lists (id, name, created_by_id, privacy, list_type)
    values (${id}::uuid, ${input.name ?? "Test Tier List"},
            ${input.createdById}::uuid,
            ${input.privacy ?? "PRIVATE"}::permission_type, 'place')
  `);
  return id;
};

export const seedTierListPlace = async (
  db: DbOrTx,
  tierListId: string,
  placeId: string,
  band = 0,
  position = 0,
): Promise<void> => {
  await db.execute(sql`
    insert into public.tier_list_items (tier_list_id, place_id, band, position)
    values (${tierListId}::uuid, ${placeId}::uuid, ${band}, ${position})
  `);
};

export const seedVisit = async (
  db: DbOrTx,
  userId: string,
  placeId: string,
  isVisited: boolean,
): Promise<void> => {
  await db.execute(sql`
    insert into public.user_place_interactions (user_id, place_id, is_visited)
    values (${userId}::uuid, ${placeId}::uuid, ${isVisited})
    on conflict on constraint unique_user_place
      do update set is_visited = excluded.is_visited
  `);
};

/* -------------------------------------------------------------------------- */
/* Recipes                                                                     */
/* -------------------------------------------------------------------------- */

/** A `recipes` row. `type` is checked to be `food` or `cocktail`. */
export const seedRecipe = async (
  db: DbOrTx,
  input: {
    readonly name: string;
    readonly description?: string | null;
    readonly type?: "food" | "cocktail";
    readonly createdById?: string | null;
  },
): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.recipes (id, name, description, type, created_by_id)
    values (${id}::uuid, ${input.name}, ${input.description ?? null},
            ${input.type ?? "cocktail"}, ${input.createdById ?? null}::uuid)
  `);
  return id;
};

export const seedRecipeVector = async (
  db: DbOrTx,
  recipeId: string,
  vector: readonly number[],
): Promise<void> => {
  await db.execute(sql`
    insert into public.recipe_vectors (recipe_id, vector)
    values (${recipeId}::uuid, ${vectorLiteral(vector)}::halfvec)
  `);
};

/* -------------------------------------------------------------------------- */
/* Category vectors                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A `category_vectors` row. Empty in this database (A9 seeds it separately),
 * so `search_category_vectors` has nothing to match without this.
 */
export const seedCategoryVector = async (
  db: DbOrTx,
  input: {
    readonly label: string;
    readonly labelType?: "category" | "alias" | "item_type" | "descriptor";
    readonly associatedCategories: readonly string[];
    readonly vector: readonly number[];
  },
): Promise<number> => {
  const rows = await db.execute<{ id: number }>(sql`
    insert into public.category_vectors
      (label, label_type, associated_categories, vector)
    values (${input.label}, ${input.labelType ?? "category"},
            ${pgTextArray(input.associatedCategories)}::text[],
            ${vectorLiteral(input.vector)}::halfvec)
    returning id
  `);
  const id = rows.rows[0]?.id;
  if (id === undefined) throw new Error("seedCategoryVector: no id");
  return id;
};

/* -------------------------------------------------------------------------- */
/* Item reviews (C2 — RankingsActor)                                           */
/* -------------------------------------------------------------------------- */

/**
 * One item of any of the six types, with whatever `NOT NULL` columns that
 * particular table happens to carry.
 *
 * `seedWine`/`seedBeer` above predate this and stay, because their extra
 * columns (`vintage`, `wine_style`) are what the search fixtures assert on.
 * This is the version `RankingsActor` needs, where the only interesting thing
 * about an item is which of `item_reviews`' six columns points at it — the
 * `CASE` that produces the item type has a branch per table, and reproducing it
 * needs a row in each.
 */
export const seedItemOfType = async (
  db: DbOrTx,
  type: ItemType,
  createdById: string,
  name = `Test ${type}`,
): Promise<ItemRef> => {
  const onboardingId = randomUUID();
  await db.execute(sql`
    insert into public.item_onboardings (id, user_id, item_type)
    values (${onboardingId}::uuid, ${createdById}::uuid, ${type})
  `);
  const id = randomUUID();
  // `spirits.type` and `coffees.description` are NOT NULL with no default;
  // `sakes` and `teas` take a nullable onboarding id. Written as one insert per
  // table rather than a clever generic one, because the differences are the
  // point.
  switch (type) {
    case "WINE":
      await db.execute(
        sql`insert into public.wine_style (value) values ('RED') on conflict do nothing`,
      );
      await db.execute(sql`
        insert into public.wines (id, name, created_by_id, vintage, style, item_onboarding_id)
        values (${id}::uuid, ${name}, ${createdById}::uuid, '2020-01-01', 'RED',
                ${onboardingId}::uuid)
      `);
      break;
    case "BEER":
      await db.execute(sql`
        insert into public.beers (id, name, created_by_id, item_onboarding_id)
        values (${id}::uuid, ${name}, ${createdById}::uuid, ${onboardingId}::uuid)
      `);
      break;
    case "SPIRIT":
      await db.execute(sql`
        insert into public.spirits (id, name, created_by_id, type, item_onboarding_id)
        values (${id}::uuid, ${name}, ${createdById}::uuid, 'WHISKEY',
                ${onboardingId}::uuid)
      `);
      break;
    case "COFFEE":
      await db.execute(sql`
        insert into public.coffees (id, name, created_by_id, description, item_onboarding_id)
        values (${id}::uuid, ${name}, ${createdById}::uuid, 'seed',
                ${onboardingId}::uuid)
      `);
      break;
    case "SAKE":
      await db.execute(sql`
        insert into public.sakes (id, name, created_by_id, item_onboarding_id)
        values (${id}::uuid, ${name}, ${createdById}::uuid, ${onboardingId}::uuid)
      `);
      break;
    case "TEA":
      await db.execute(sql`
        insert into public.teas (id, name, created_by_id, item_onboarding_id)
        values (${id}::uuid, ${name}, ${createdById}::uuid, ${onboardingId}::uuid)
      `);
      break;
  }
  return { type, id };
};

/** The table `ref` lives in. Exported so a test can assert against the schema. */
export const itemTableOf = (type: ItemType): string =>
  getTableName(ITEM_TABLES[type]);

/**
 * One `item_reviews` row.
 *
 * `score` is checked against a half-star scale (0.5 … 5.0); anything else is
 * rejected by `"Score in allowed values"`, which is a constraint a fixture
 * should feel rather than route around.
 */
export const seedItemReview = async (
  db: DbOrTx,
  userId: string,
  ref: ItemRef,
  score: number,
): Promise<void> => {
  await db.execute(sql`
    insert into public.item_reviews (${ARCS.itemReviews.unqualified(ref.type)}, user_id, score)
    values (${ref.id}::uuid, ${userId}::uuid, ${score})
  `);
};
