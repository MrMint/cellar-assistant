import type { TableName } from "./schema/index.ts";

/**
 * The single-writer registry (migration-plan §1.2, filled from §3).
 *
 * > Every application table has exactly one writing actor class. A collection,
 * > search, view, or reference actor never writes. A cross-aggregate operation
 * > is a sequence of idempotent calls to the owning actors, with the outbox as
 * > the retry mechanism. No actor writes another aggregate's rows, even inside
 * > a transaction.
 *
 * `writers.test.ts` enforces two halves of that:
 *
 *   1. **coverage** — every table in the Drizzle schema has exactly one entry
 *      here. `satisfies Record<TableName, Writer>` makes the compiler say so
 *      too, so a table added by a `drizzle-kit pull` fails typecheck as well as
 *      the test;
 *   2. **containment** — the only module in `services/actors/src` that calls
 *      `.insert(t)` / `.update(t)` / `.delete(t)` for a table, or names it in a
 *      write statement in raw SQL, is that table's writer module.
 *
 * ## Adding an actor (B workstreams)
 *
 * Add the class name to `ACTOR_WRITERS`, point its tables at it below, and put
 * the class in `services/actors/src/actors/<kebab-case-name>.ts` — or a directory
 * of that name, if the aggregate needs several files. That path *is* the rule:
 * `writerModule()` derives it, and a write from anywhere else fails the test.
 */

/**
 * Every actor class that writes. Keep it sorted; the string must match the
 * class name exactly, because the containment check derives the module path
 * from it.
 */
export const ACTOR_WRITERS = [
  "BarcodeActor",
  "BrandActor",
  "BudgetActor",
  "CategoryVectorsActor",
  "CellarActor",
  "FileActor",
  "ItemActor",
  "ItemOnboardingActor",
  "JobActor",
  "MaintenanceActor",
  "MenuScanActor",
  "PlaceActor",
  "RecipeActor",
  "RecipeGroupActor",
  "TierListActor",
  "UserActor",
] as const;

export type ActorWriter = (typeof ACTOR_WRITERS)[number];

/**
 * §3's "exempt (infrastructure)" rows. These are not actors, and the exemption
 * verb says *why* each one is exempt — the three reasons are different, and two
 * of them are opposites:
 *
 * - `infrastructure:outbox` — **everything writes it.** Every actor inserts into
 *   `outbox` inside its own transaction (§1.4), so a write may appear anywhere.
 *   `OutboxActor` is the only thing that *updates* status, but that is not
 *   mechanically checkable from an insert site and is not worth a second rule.
 * - `infrastructure:migrations` — **nothing writes it.** Reference data (§4's
 *   "table" column) changes by migration; `ReferenceDataActor` reads it, and a
 *   write from anywhere in `services/actors` is a violation.
 * - `infrastructure:better-auth` — **something that is not an actor writes it,
 *   and no actor may.** better-auth's own Drizzle adapter owns `user`,
 *   `session`, `account`, `verification` and `jwks`; §3 exempts them from the
 *   actor map because no actor class could truthfully be named as their writer.
 *
 *   This entry did not exist before X2 because the tables were not in this
 *   schema at all: they lived in a separate `auth_dev` database with their own
 *   connection, so `satisfies Record<TableName, Writer>` never asked about them.
 *   Now that one database holds both, the exemption has to be *stated* rather
 *   than obtained by absence — which is the point of the registry.
 *
 *   Unlike `infrastructure:outbox`, this is not "a write may appear anywhere":
 *   the containment half confines these writes to `BETTER_AUTH_WRITER_MODULES`
 *   below. It is closer to `infrastructure:migrations` — no actor writes them —
 *   except that the writer is a live process rather than a migration.
 */
export const INFRASTRUCTURE_WRITERS = [
  "infrastructure:outbox",
  "infrastructure:migrations",
  "infrastructure:better-auth",
] as const;

export type InfrastructureWriter = (typeof INFRASTRUCTURE_WRITERS)[number];

/**
 * The modules under `services/actors/src` that may write better-auth's tables.
 * Anything else naming one is a violation, exactly as if it had named another
 * actor's aggregate.
 *
 * - `auth` — better-auth itself: its adapter, its `createAuth`, its bcrypt
 *   re-hash. The whole directory, because the library's write surface is not
 *   one file.
 * - `lib/profile-store` — B4's declared seam. `UserActor.updateProfile` cannot
 *   call better-auth's session-shaped HTTP API from inside a turn (§2.1 forbids
 *   a network round trip there), so the proxy is at the storage layer instead:
 *   the same three columns better-auth's adapter writes, and nothing else.
 *   `role`, `disabled` and `emailVerified` are deliberately not writable there.
 *
 * Paths are relative to `services/actors/src`, matched as a file or as a directory
 * prefix — the same rule `writerModule()` gets for an actor.
 */
export const BETTER_AUTH_WRITER_MODULES = [
  "auth",
  "lib/profile-store",
] as const;

export type Writer = ActorWriter | InfrastructureWriter;

export const TABLE_WRITERS = {
  // CellarActor — §2.1
  cellars: "CellarActor",
  cellar_owners: "CellarActor",
  cellar_items: "CellarActor",
  check_ins: "CellarActor",

  // ItemActor — one actor per `type:itemId`; the six physical item tables and
  // their satellites are hidden behind it.
  wines: "ItemActor",
  beers: "ItemActor",
  spirits: "ItemActor",
  coffees: "ItemActor",
  sakes: "ItemActor",
  teas: "ItemActor",
  generic_items: "ItemActor",
  item_image: "ItemActor",
  item_image_vectors: "ItemActor",
  item_vectors: "ItemActor",
  item_reviews: "ItemActor",
  item_brands: "ItemActor",

  // UserActor — rows where `user_id` is the actor's user.
  item_favorites: "UserActor",
  user_place_interactions: "UserActor",
  friends: "UserActor",
  friend_requests: "UserActor",

  item_onboardings: "ItemOnboardingActor",
  barcodes: "BarcodeActor",

  // BrandActor writes; BrandRegistryActor holds the find-or-create lock and
  // calls `BrandActor.create` — a registry never inserts (§1.2).
  brands: "BrandActor",

  // PlaceActor — created via PlaceCreationActor, same rule as brands.
  places: "PlaceActor",
  place_google_enrichments: "PlaceActor",
  place_google_photos: "PlaceActor",
  place_menus: "PlaceActor",
  place_menu_items: "PlaceActor",
  place_brands: "PlaceActor",
  place_vectors: "PlaceActor",
  menu_item_recipes: "PlaceActor",

  category_vectors: "CategoryVectorsActor",

  recipes: "RecipeActor",
  recipe_ingredients: "RecipeActor",
  recipe_instructions: "RecipeActor",
  recipe_vectors: "RecipeActor",
  recipe_reviews: "RecipeActor",
  recipe_groups: "RecipeGroupActor",
  recipe_votes: "RecipeGroupActor",

  tier_lists: "TierListActor",
  tier_list_items: "TierListActor",

  menu_scans: "MenuScanActor",
  item_match_suggestions: "MenuScanActor",

  files: "FileActor",

  api_budget_config: "BudgetActor",
  api_usage_log: "BudgetActor",

  jobs: "JobActor",

  // Infrastructure (§3).
  outbox: "infrastructure:outbox",

  // MaintenanceActor.acknowledgeDeadLetters is the only writer (C4) — it is
  // not "everything writes it" the way `outbox` is: an operator triage
  // decision, not a side effect every actor's transaction produces.
  outbox_dead_letter_acks: "MaintenanceActor",

  // better-auth (§3, target-stack §6.5 Q22/Q29). Written by the library's own
  // Drizzle adapter through the shared pool, never by an actor — see
  // `infrastructure:better-auth` above.
  user: "infrastructure:better-auth",
  session: "infrastructure:better-auth",
  account: "infrastructure:better-auth",
  verification: "infrastructure:better-auth",
  jwks: "infrastructure:better-auth",

  // Reference data (§4). Migrations only; `ReferenceDataActor(kind)` reads.
  beer_style: "infrastructure:migrations",
  coffee_cultivar: "infrastructure:migrations",
  country: "infrastructure:migrations",
  sake_category: "infrastructure:migrations",
  sake_rice_variety: "infrastructure:migrations",
  sake_type: "infrastructure:migrations",
  spirit_type: "infrastructure:migrations",
  tea_category: "infrastructure:migrations",
  wine_style: "infrastructure:migrations",
  wine_variety: "infrastructure:migrations",
} as const satisfies Record<TableName, Writer>;

export const writerFor = (table: string): Writer | undefined =>
  (TABLE_WRITERS as Record<string, Writer | undefined>)[table];

/** Tables declared in the schema that have no writing actor. */
export const tablesWithoutWriter = (tableNames: readonly string[]): string[] =>
  tableNames.filter((name) => writerFor(name) === undefined);

export const isActorWriter = (writer: Writer): writer is ActorWriter =>
  (ACTOR_WRITERS as readonly string[]).includes(writer);

/**
 * The module path that owns a writer's writes, relative to `services/actors/src`.
 *
 * `CellarActor` → `actors/cellar-actor`. The containment check accepts that
 * path with a `.ts` suffix, or any file beneath a directory of that name.
 */
export const writerModule = (writer: ActorWriter): string =>
  `actors/${writer.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;

/** Is `file` one of the modules allowed to write better-auth's tables? */
export const isBetterAuthWriterModule = (file: string): boolean =>
  BETTER_AUTH_WRITER_MODULES.some(
    (module) => file === `${module}.ts` || file.startsWith(`${module}/`),
  );
