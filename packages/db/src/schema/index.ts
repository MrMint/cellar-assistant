/**
 * The Drizzle baseline (migration-plan §6 A3, re-taken by X2).
 *
 * `tables.ts` and `relations.ts` are `drizzle-kit pull --init` output taken
 * against the transformed database (`../transform/`). `relations.ts` has been
 * hand-audited — see `../README.md` for what was changed and why.
 *
 * Regenerate with the command recorded in `../README.md`; do not hand-edit
 * `tables.ts`, and re-run the `.through()` audit whenever `relations.ts` is
 * regenerated.
 */

import * as t from "./tables.ts";

export { relations } from "./relations.ts";
export * from "./tables.ts";

/**
 * better-auth's five tables, keyed by the model name its Drizzle adapter looks
 * them up under. Handed to `drizzleAdapter(db, { schema: authSchema })` in
 * `services/actors/src/auth/auth.ts`.
 *
 * These are the only tables in this schema that an actor does not write —
 * better-auth's own adapter does (§3, and `../writers.ts`'s
 * `infrastructure:better-auth`). X2 merged them out of the separate `auth_dev`
 * database and into `public`, which is what let the 31 `public.*` foreign keys
 * that used to reference `auth.users(id)` reference `"user"(id)` instead.
 *
 * **The property names in `tables.ts` are a contract.** better-auth's adapter
 * addresses a column by the JS property name Drizzle derives from it, so a
 * re-pull that renamed one would break sign-in at runtime and compile fine.
 * `services/actors/src/auth/auth-schema.test.ts` checks this object against
 * better-auth's own `getAuthTables()` for exactly that reason.
 */
export const authSchema = {
  user: t.user,
  session: t.session,
  account: t.account,
  verification: t.verification,
  jwks: t.jwks,
} as const;

/**
 * Application tables, keyed by their Postgres name. `spatial_ref_sys` is
 * PostGIS's own and is filtered out of the pull.
 *
 * `auth.*` and `storage.*` are gone rather than merely absent: A6/X2 replaced
 * `auth` with the five better-auth tables below and `transform/15` dropped the
 * schema, and A8 copied `storage.files` into `public.files`. `storage` itself
 * survives as unreferenced rows until E1 verifies the file migration against
 * production; nothing in `public` points at it and nothing here declares it.
 */
export const tables = {
  account: t.account,
  api_budget_config: t.apiBudgetConfig,
  api_usage_log: t.apiUsageLog,
  barcodes: t.barcodes,
  beer_style: t.beerStyle,
  beers: t.beers,
  brands: t.brands,
  category_vectors: t.categoryVectors,
  cellar_items: t.cellarItems,
  cellar_owners: t.cellarOwners,
  cellars: t.cellars,
  check_ins: t.checkIns,
  coffee_cultivar: t.coffeeCultivar,
  coffees: t.coffees,
  country: t.country,
  files: t.files,
  friend_requests: t.friendRequests,
  friends: t.friends,
  generic_items: t.genericItems,
  item_brands: t.itemBrands,
  item_favorites: t.itemFavorites,
  item_image: t.itemImage,
  item_match_suggestions: t.itemMatchSuggestions,
  item_onboardings: t.itemOnboardings,
  item_reviews: t.itemReviews,
  item_vectors: t.itemVectors,
  jobs: t.jobs,
  jwks: t.jwks,
  menu_item_recipes: t.menuItemRecipes,
  menu_scans: t.menuScans,
  outbox: t.outbox,
  outbox_dead_letter_acks: t.outboxDeadLetterAcks,
  place_brands: t.placeBrands,
  place_google_enrichments: t.placeGoogleEnrichments,
  place_google_photos: t.placeGooglePhotos,
  place_menu_items: t.placeMenuItems,
  place_menus: t.placeMenus,
  place_vectors: t.placeVectors,
  places: t.places,
  recipe_groups: t.recipeGroups,
  recipe_ingredients: t.recipeIngredients,
  recipe_instructions: t.recipeInstructions,
  recipe_reviews: t.recipeReviews,
  recipe_vectors: t.recipeVectors,
  recipe_votes: t.recipeVotes,
  recipes: t.recipes,
  sake_category: t.sakeCategory,
  sake_rice_variety: t.sakeRiceVariety,
  sake_type: t.sakeType,
  sakes: t.sakes,
  session: t.session,
  spirit_type: t.spiritType,
  spirits: t.spirits,
  tea_category: t.teaCategory,
  teas: t.teas,
  tier_list_items: t.tierListItems,
  tier_lists: t.tierLists,
  user: t.user,
  user_place_interactions: t.userPlaceInteractions,
  verification: t.verification,
  wine_style: t.wineStyle,
  wine_variety: t.wineVariety,
  wines: t.wines,
} as const;

export type TableName = keyof typeof tables & string;
