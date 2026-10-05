import { pgEnum, pgTable, uuid, text, serial, halfvec, timestamp, bigserial, integer, boolean, jsonb, real, json, numeric, date, customType, char, doublePrecision, uniqueIndex, index, foreignKey, type AnyPgColumn, primaryKey, unique, check } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
// HAND-EDIT #4 (see ../../README.md): drizzle-kit rc.4 introspects `geography`
// and `tsvector` as untyped `customType(...)` placeholders. `geography` and
// `tsvector` below are the typed wrappers from `./custom-types.ts`; re-apply
// this import and the three column swaps after every re-pull.
import { geography, tsvector } from "./custom-types.ts"

export const itemType = pgEnum("item_type", ["BEER", "COFFEE", "SAKE", "SPIRIT", "TEA", "WINE"])
export const permissionType = pgEnum("permission_type", ["FRIENDS", "PRIVATE", "PUBLIC"])
export const friendRequestStatus = pgEnum("friend_request_status", ["ACCEPTED", "PENDING"])
export const instructionTypes = pgEnum("instruction_types", ["chill", "cook", "garnish", "mix", "prep", "serve"])
export const brandTypes = pgEnum("brand_types", ["brewery", "distillery", "kura", "manufacturer", "other", "restaurant_chain", "roastery", "tea_house", "winery"])
export const recipeCategory = pgEnum("recipe_category", ["cocktail", "mocktail", "other", "punch", "shot"])
export const coffeeRoastLevel = pgEnum("coffee_roast_level", ["DARK", "EXTRA_DARK", "LIGHT", "LIGHT_MEDIUM", "MEDIUM", "MEDIUM_DARK"])
export const coffeeProcess = pgEnum("coffee_process", ["HONEY", "NATURAL_DRY", "PULPED_NATURAL", "PULPED_NATURAL_HONEY", "WASHED", "WET_HULLED"])
export const coffeeSpecies = pgEnum("coffee_species", ["ARABICA", "CHARRIERIANA", "LIBERICA", "ROBUSTA", "STENOPHYLLA"])
export const teaCaffeineLevel = pgEnum("tea_caffeine_level", ["decaf", "high", "low", "medium", "none"])
export const teaForm = pgEnum("tea_form", ["brick", "instant", "loose_leaf", "matcha_powder", "sachet", "tea_bag"])
export const sakeServingTemperature = pgEnum("sake_serving_temperature", ["atsu_kan", "hitohada_kan", "hiya", "jo_kan", "nuru_kan", "rei_shu", "room_temperature", "tobikiri_kan", "yuki_hie"])


export const account = pgTable("account", {
	id: uuid().primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
	scope: text(),
	password: text(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [
	uniqueIndex("account_provider_account_key").using("btree", table.providerId.asc().nullsLast(), table.accountId.asc().nullsLast()),
	index("account_user_id_idx").using("btree", table.userId.asc().nullsLast()),
]);

export const apiBudgetConfig = pgTable("api_budget_config", {
	service: text().notNull(),
	monthlyBudgetCents: integer("monthly_budget_cents").default(0).notNull(),
	isEnabled: boolean("is_enabled").default(true).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
	endpoint: text().default("").notNull(),
	freeTierMonthlyRequests: integer("free_tier_monthly_requests").default(0).notNull(),
}, (table) => [
	primaryKey({ columns: [table.service, table.endpoint], name: "api_budget_config_pkey"}),
]);

export const apiUsageLog = pgTable("api_usage_log", {
	id: uuid().defaultRandom().primaryKey(),
	service: text().notNull(),
	endpoint: text().notNull(),
	estimatedCostCents: integer("estimated_cost_cents").notNull(),
	entityId: uuid("entity_id"),
	entityType: text("entity_type"),
	triggeredBy: uuid("triggered_by"),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	index("idx_api_usage_log_created_at").using("btree", table.createdAt.asc().nullsLast()),
	// `BudgetActor.#reserve`'s replay lookup, which runs inside the singleton on
	// every reservation that carries an id. Without it that lookup was a scan of
	// the endpoint's whole history (`idx_api_usage_log_service_created` narrows
	// by service only). Partial, because most non-model rows carry no id.
	// Placed where `drizzle-kit pull` sorts it, so cutover's baseline diff is
	// empty rather than a reordering.
	index("idx_api_usage_log_reservation_id").using("btree", sql`(metadata ->> 'reservationId'::text)`).where(sql`((metadata ->> 'reservationId'::text) IS NOT NULL)`),
	index("idx_api_usage_log_service_created").using("btree", table.service.asc().nullsLast(), table.createdAt.asc().nullsLast()),
]);

export const barcodes = pgTable("barcodes", {
	code: text().primaryKey(),
	type: text(),
}, (table) => [
	// One spelling per product: `code` must already be what
	// `canonicalBarcodeCode` (packages/contracts/src/barcodes.ts) makes of it,
	// so the primary key is the unique index on the canonical code. The SQL
	// function is its mirror, created by the migration that added this.
check("barcodes_code_canonical", sql`(code = canonical_barcode_code(code, NULL::text))`),]);

export const beerStyle = pgTable("beer_style", {
	value: text().primaryKey(),
	comment: text(),
});

export const beers = pgTable("beers", {
	id: uuid().defaultRandom().primaryKey(),
	name: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
	createdById: uuid("created_by_id").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	alcoholContentPercentage: numeric("alcohol_content_percentage"),
	internationalBitternessUnit: integer("international_bitterness_unit"),
	description: text(),
	style: text().references(() => beerStyle.value),
	vintage: date(),
	barcodeCode: text("barcode_code").references(() => barcodes.code, { onDelete: "restrict", onUpdate: "restrict" } ),
	country: text().references(() => country.value),
	itemOnboardingId: uuid("item_onboarding_id").notNull().references(() => itemOnboardings.id, { onDelete: "restrict", onUpdate: "restrict" } ),
}, (table) => [
check("Alcohol content percentage greater than 0 and less than 100", sql`((alcohol_content_percentage >= (0)::numeric) AND (alcohol_content_percentage <= (100)::numeric))`),]);

export const brands = pgTable("brands", {
	id: uuid().defaultRandom().primaryKey(),
	name: text().notNull(),
	description: text(),
	logoUrl: text("logo_url"),
	brandType: brandTypes("brand_type"),
	parentBrandId: uuid("parent_brand_id"),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
	foreignKey({
		columns: [table.parentBrandId],
		foreignColumns: [table.id],
		name: "brands_parent_brand_id_brands_id_fkey"
	}),
	uniqueIndex("brands_unique_lower_name").using("btree", sql`lower(name)`),
	index("idx_brands_name").using("btree", table.name.asc().nullsLast()),
	index("idx_brands_name_trgm").using("gin", table.name.asc().nullsLast().op("gin_trgm_ops")),
	index("idx_brands_parent").using("btree", table.parentBrandId.asc().nullsLast()),
	index("idx_brands_type").using("btree", table.brandType.asc().nullsLast()),
]);

export const categoryVectors = pgTable("category_vectors", {
	id: serial().primaryKey(),
	label: text().notNull(),
	labelType: text("label_type").default("category").notNull(),
	associatedCategories: text("associated_categories").array().default([]),
	vector: halfvec({ dimensions: 768 }).notNull(),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
	index("idx_category_vectors_hnsw").using("hnsw", table.vector.asc().nullsLast().op("halfvec_cosine_ops")).with({ "m": 16, "ef_construction": 64 }),
	index("idx_category_vectors_label_type").using("btree", table.labelType.asc().nullsLast()),
	unique("category_vectors_label_key").on(table.label),check("category_vectors_label_type_check", sql`(label_type = ANY (ARRAY['category'::text, 'alias'::text, 'item_type'::text, 'descriptor'::text]))`),]);

export const cellarItems = pgTable("cellar_items", {
	id: uuid().defaultRandom().primaryKey(),
	cellarId: uuid("cellar_id").notNull().references(() => cellars.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	createdBy: uuid("created_by").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	wineId: uuid("wine_id").references(() => wines.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	beerId: uuid("beer_id").references(() => beers.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	spiritId: uuid("spirit_id").references(() => spirits.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	openAt: timestamp("open_at", { withTimezone: true }),
	emptyAt: timestamp("empty_at", { withTimezone: true }),
	displayImageId: uuid("display_image_id").references(() => itemImage.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
	percentageRemaining: numeric("percentage_remaining", { mode: 'number' }).default(100).notNull(),
	coffeeId: uuid("coffee_id").references(() => coffees.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	sourceType: text("source_type"),
	sourcePlaceId: uuid("source_place_id").references(() => places.id, { onDelete: "set null" } ),
	sourceMenuItemId: uuid("source_menu_item_id").references(() => placeMenuItems.id, { onDelete: "set null" } ),
	sakeId: uuid("sake_id").references(() => sakes.id),
	teaId: uuid("tea_id").references(() => teas.id),
	type: text().generatedAlwaysAs(sql`
CASE
    WHEN (beer_id IS NOT NULL) THEN 'BEER'::text
    WHEN (wine_id IS NOT NULL) THEN 'WINE'::text
    WHEN (coffee_id IS NOT NULL) THEN 'COFFEE'::text
    WHEN (sake_id IS NOT NULL) THEN 'SAKE'::text
    WHEN (tea_id IS NOT NULL) THEN 'TEA'::text
    ELSE 'SPIRIT'::text
END`),
}, (table) => [
	index("idx_cellar_items_cellar_id").using("btree", table.cellarId.asc().nullsLast()),
	index("idx_cellar_items_sake_id").using("btree", table.sakeId.asc().nullsLast()),
	index("idx_cellar_items_tea_id").using("btree", table.teaId.asc().nullsLast()),
check("cellar_items_source_type_check", sql`(source_type = ANY (ARRAY['manual'::text, 'menu_discovery'::text, 'menu_scan'::text, 'import'::text]))`),check("Ensure exactly one item Id", sql`(num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) = 1)`),check("Percentage remaining between 0 and 100", sql`((percentage_remaining >= (0)::numeric) AND (percentage_remaining <= (100)::numeric))`),]);

export const cellarOwners = pgTable("cellar_owners", {
	userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	cellarId: uuid("cellar_id").notNull().references(() => cellars.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	primaryKey({ columns: [table.userId, table.cellarId], name: "cellar_owners_pkey"}),
	index("idx_cellar_owners_cellar").using("btree", table.cellarId.asc().nullsLast(), table.userId.asc().nullsLast()),
]);

export const cellars = pgTable("cellars", {
	id: uuid().defaultRandom().primaryKey(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
	name: text().notNull(),
	createdById: uuid("created_by_id").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	privacy: permissionType().default("PRIVATE").notNull(),
}, (table) => [
	index("idx_cellars_created_by_id").using("btree", table.createdById.asc().nullsLast()),
	index("idx_cellars_privacy_public").using("btree", table.id.asc().nullsLast()).where(sql`(privacy = 'PUBLIC'::permission_type)`),
]);

export const checkIns = pgTable("check_ins", {
	id: uuid().defaultRandom().primaryKey(),
	userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	cellarItemId: uuid("cellar_item_id").notNull().references(() => cellarItems.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

export const coffeeCultivar = pgTable("coffee_cultivar", {
	value: text().primaryKey(),
	comment: text(),
});

export const coffees = pgTable("coffees", {
	id: uuid().defaultRandom().primaryKey(),
	name: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
	createdById: uuid("created_by_id").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	description: text().notNull(),
	roastLevel: coffeeRoastLevel("roast_level"),
	country: text().references(() => country.value),
	process: coffeeProcess(),
	barcodeCode: text("barcode_code").references(() => barcodes.code, { onDelete: "restrict", onUpdate: "restrict" } ),
	itemOnboardingId: uuid("item_onboarding_id").notNull().references(() => itemOnboardings.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	species: coffeeSpecies(),
	cultivar: text().references(() => coffeeCultivar.value),
});

export const country = pgTable("country", {
	value: text().primaryKey(),
	comment: text(),
});

export const files = pgTable("files", {
	id: uuid().defaultRandom().primaryKey(),
	bucket: text().default("cellar-files").notNull(),
	key: text().notNull(),
	size: integer(),
	mimeType: text("mime_type"),
	etag: text(),
	uploadedBy: uuid("uploaded_by"),
	verifiedAt: timestamp("verified_at", { withTimezone: true }),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	uniqueIndex("files_bucket_key_idx").using("btree", table.bucket.asc().nullsLast(), table.key.asc().nullsLast()),
	index("files_unverified_idx").using("btree", table.createdAt.asc().nullsLast()).where(sql`(verified_at IS NULL)`),
]);

export const friendRequests = pgTable("friend_requests", {
	id: uuid().defaultRandom().primaryKey(),
	userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	friendId: uuid("friend_id").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	status: friendRequestStatus().notNull(),
}, (table) => [
	unique("friend_requests_user_id_friend_id_key").on(table.userId, table.friendId),]);

export const friends = pgTable("friends", {
	userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	friendId: uuid("friend_id").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	primaryKey({ columns: [table.userId, table.friendId], name: "friends_pkey"}),
	index("idx_friends_friend_user").using("btree", table.friendId.asc().nullsLast(), table.userId.asc().nullsLast()),
]);

export const genericItems = pgTable("generic_items", {
	id: uuid().defaultRandom().primaryKey(),
	name: text().notNull(),
	category: text().notNull(),
	subcategory: text(),
	itemType: text("item_type").notNull(),
	description: text(),
	isSubstitutable: boolean("is_substitutable").default(true),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
	createdById: uuid("created_by_id").references(() => user.id, { onDelete: "set null" } ),
}, (table) => [
	index("idx_generic_items_category").using("btree", table.category.asc().nullsLast()),
	index("idx_generic_items_created_by").using("btree", table.createdById.asc().nullsLast()),
	index("idx_generic_items_item_type").using("btree", table.itemType.asc().nullsLast()),
	unique("idx_generic_items_name_category").on(table.name, table.category),check("generic_items_item_type_check", sql`(item_type = ANY (ARRAY['spirit'::text, 'wine'::text, 'beer'::text, 'coffee'::text, 'sake'::text, 'tea'::text, 'ingredient'::text]))`),]);

export const itemBrands = pgTable("item_brands", {
	id: uuid().defaultRandom().primaryKey(),
	wineId: uuid("wine_id").references(() => wines.id),
	beerId: uuid("beer_id").references(() => beers.id),
	spiritId: uuid("spirit_id").references(() => spirits.id),
	coffeeId: uuid("coffee_id").references(() => coffees.id),
	brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" } ),
	isPrimary: boolean("is_primary").default(false),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	sakeId: uuid("sake_id").references(() => sakes.id),
	teaId: uuid("tea_id").references(() => teas.id),
}, (table) => [
	index("idx_item_brands_beer_id").using("btree", table.beerId.asc().nullsLast()),
	index("idx_item_brands_brand_id").using("btree", table.brandId.asc().nullsLast()),
	index("idx_item_brands_coffee_id").using("btree", table.coffeeId.asc().nullsLast()),
	index("idx_item_brands_sake_id").using("btree", table.sakeId.asc().nullsLast()),
	index("idx_item_brands_spirit_id").using("btree", table.spiritId.asc().nullsLast()),
	index("idx_item_brands_tea_id").using("btree", table.teaId.asc().nullsLast()),
	index("idx_item_brands_wine_id").using("btree", table.wineId.asc().nullsLast()),
check("exactly_one_item_reference", sql`(num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) = 1)`),]);

export const itemFavorites = pgTable("item_favorites", {
	id: uuid().defaultRandom().primaryKey(),
	userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	beerId: uuid("beer_id").references(() => beers.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	wineId: uuid("wine_id").references(() => wines.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	spiritId: uuid("spirit_id").references(() => spirits.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	coffeeId: uuid("coffee_id").references(() => coffees.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	sakeId: uuid("sake_id").references(() => sakes.id),
	teaId: uuid("tea_id").references(() => teas.id),
	type: itemType().notNull().generatedAlwaysAs(sql`
CASE
    WHEN (beer_id IS NOT NULL) THEN 'BEER'::item_type
    WHEN (wine_id IS NOT NULL) THEN 'WINE'::item_type
    WHEN (coffee_id IS NOT NULL) THEN 'COFFEE'::item_type
    WHEN (sake_id IS NOT NULL) THEN 'SAKE'::item_type
    WHEN (tea_id IS NOT NULL) THEN 'TEA'::item_type
    ELSE 'SPIRIT'::item_type
END`),
}, (table) => [
	index("idx_item_favorites_sake_id").using("btree", table.sakeId.asc().nullsLast()),
	index("idx_item_favorites_tea_id").using("btree", table.teaId.asc().nullsLast()),
	unique("item_favorites_user_id_beer_id_key").on(table.userId, table.beerId),	unique("item_favorites_user_id_coffee_id_key").on(table.userId, table.coffeeId),	unique("item_favorites_user_id_sake_id_key").on(table.userId, table.sakeId),	unique("item_favorites_user_id_spirit_id_key").on(table.userId, table.spiritId),	unique("item_favorites_user_id_tea_id_key").on(table.userId, table.teaId),	unique("item_favorites_user_id_wine_id_key").on(table.userId, table.wineId),check("Ensure one item_id present", sql`(num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) = 1)`),]);

export const itemImage = pgTable("item_image", {
	id: uuid().defaultRandom().primaryKey(),
	userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	fileId: uuid("file_id").notNull().references(() => files.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	beerId: uuid("beer_id").references(() => beers.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	wineId: uuid("wine_id").references(() => wines.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	spiritId: uuid("spirit_id").references(() => spirits.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	isPublic: boolean("is_public").notNull(),
	placeholder: text(),
	coffeeId: uuid("coffee_id").references(() => coffees.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
	sakeId: uuid("sake_id").references(() => sakes.id),
	teaId: uuid("tea_id").references(() => teas.id),
}, (table) => [
	index("idx_item_image_sake_id").using("btree", table.sakeId.asc().nullsLast()),
	index("idx_item_image_tea_id").using("btree", table.teaId.asc().nullsLast()),
check("Ensure at least one item Id", sql`(num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) = 1)`),]);

export const itemMatchSuggestions = pgTable("item_match_suggestions", {
	id: uuid().defaultRandom().primaryKey(),
	placeMenuItemId: uuid("place_menu_item_id").notNull().references(() => placeMenuItems.id, { onDelete: "cascade" } ),
	suggestedWineId: uuid("suggested_wine_id").references(() => wines.id, { onDelete: "cascade" } ),
	suggestedBeerId: uuid("suggested_beer_id").references(() => beers.id, { onDelete: "cascade" } ),
	suggestedSpiritId: uuid("suggested_spirit_id").references(() => spirits.id, { onDelete: "cascade" } ),
	suggestedCoffeeId: uuid("suggested_coffee_id").references(() => coffees.id, { onDelete: "cascade" } ),
	suggestedSakeId: uuid("suggested_sake_id").references(() => sakes.id, { onDelete: "cascade" } ),
	suggestedRecipeId: uuid("suggested_recipe_id").references(() => recipes.id, { onDelete: "cascade" } ),
	confidenceScore: numeric("confidence_score", { precision: 3, scale: 2 }).notNull(),
	matchReasoning: text("match_reasoning"),
	similarityMetrics: jsonb("similarity_metrics"),
	accepted: boolean(),
	rejected: boolean(),
	actedBy: uuid("acted_by").references(() => user.id, { onDelete: "set null" } ),
	actedAt: timestamp("acted_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	suggestedTeaId: uuid("suggested_tea_id").references(() => teas.id),
}, (table) => [
	index("idx_item_match_suggestions_suggested_tea_id").using("btree", table.suggestedTeaId.asc().nullsLast()),
	index("idx_match_suggestions_pending").using("btree", table.placeMenuItemId.asc().nullsLast()).where(sql`((accepted IS NULL) AND (rejected IS NULL))`),
check("check_single_suggested_item", sql`(num_nonnulls(suggested_wine_id, suggested_beer_id, suggested_spirit_id, suggested_coffee_id, suggested_sake_id, suggested_tea_id, suggested_recipe_id) = 1)`),]);

export const itemOnboardings = pgTable("item_onboardings", {
	id: uuid().defaultRandom().primaryKey(),
	userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
	status: text().default("START").notNull(),
	barcode: text(),
	barcodeType: text("barcode_type"),
	frontLabelImageId: uuid("front_label_image_id").references(() => files.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	backLabelImageId: uuid("back_label_image_id").references(() => files.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	rawDefaults: text("raw_defaults"),
	defaults: jsonb(),
	itemType: text("item_type").notNull(),
	aiModel: text("ai_model"),
	confidence: doublePrecision(),
	lastReprocessResult: jsonb("last_reprocess_result"),
});

export const itemReviews = pgTable("item_reviews", {
	id: uuid().defaultRandom().primaryKey(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
	score: real().notNull(),
	text: json(),
	beerId: uuid("beer_id").references(() => beers.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	wineId: uuid("wine_id").references(() => wines.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	spiritId: uuid("spirit_id").references(() => spirits.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	coffeeId: uuid("coffee_id").references(() => coffees.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	sakeId: uuid("sake_id").references(() => sakes.id),
	teaId: uuid("tea_id").references(() => teas.id),
}, (table) => [
	index("idx_item_reviews_sake_id").using("btree", table.sakeId.asc().nullsLast()),
	index("idx_item_reviews_tea_id").using("btree", table.teaId.asc().nullsLast()),
check("Ensure one item_id present", sql`(num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) = 1)`),check("Score in allowed values", sql`(score = ANY (ARRAY[(0.5)::double precision, ((1)::numeric)::double precision, (1.5)::double precision, ((2)::numeric)::double precision, (2.5)::double precision, ((3)::numeric)::double precision, (3.5)::double precision, ((4)::numeric)::double precision, (4.5)::double precision, ((5)::numeric)::double precision]))`),]);

export const itemVectors = pgTable("item_vectors", {
	id: serial().primaryKey(),
	beerId: uuid("beer_id").references(() => beers.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	wineId: uuid("wine_id").references(() => wines.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	spiritId: uuid("spirit_id").references(() => spirits.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	coffeeId: uuid("coffee_id").references(() => coffees.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
	vector: halfvec({ dimensions: 768 }),
	sakeId: uuid("sake_id").references(() => sakes.id),
	teaId: uuid("tea_id").references(() => teas.id),
	embeddingModel: text("embedding_model"),
	embeddingImages: text("embedding_images"),
}, (table) => [
	uniqueIndex("idx_item_vectors_beer_id").using("btree", table.beerId.asc().nullsLast()),
	uniqueIndex("idx_item_vectors_coffee_id").using("btree", table.coffeeId.asc().nullsLast()),
	uniqueIndex("idx_item_vectors_sake_id").using("btree", table.sakeId.asc().nullsLast()),
	uniqueIndex("idx_item_vectors_spirit_id").using("btree", table.spiritId.asc().nullsLast()),
	uniqueIndex("idx_item_vectors_tea_id").using("btree", table.teaId.asc().nullsLast()),
	uniqueIndex("idx_item_vectors_wine_id").using("btree", table.wineId.asc().nullsLast()),
	index("item_vectors_vector_hnsw_idx").using("hnsw", table.vector.asc().nullsLast().op("halfvec_cosine_ops")).with({ "m": 16, "ef_construction": 64 }),
check("exactly_one_item_reference", sql`(num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) = 1)`),]);

export const jobs = pgTable("jobs", {
	id: uuid().defaultRandom().primaryKey(),
	kind: text().notNull(),
	status: text().default("pending").notNull(),
	cursor: jsonb(),
	payload: jsonb().default({}).notNull(),
	total: integer(),
	processed: integer().default(0).notNull(),
	attempts: integer().default(0).notNull(),
	lastError: text("last_error"),
	cancelRequested: boolean("cancel_requested").default(false).notNull(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
	startedAt: timestamp("started_at", { withTimezone: true }),
	finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (table) => [
	index("jobs_kind_status_idx").using("btree", table.kind.asc().nullsLast(), table.status.asc().nullsLast()),
check("jobs_status_check", sql`(status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]))`),]);

export const jwks = pgTable("jwks", {
	id: uuid().primaryKey(),
	publicKey: text("public_key").notNull(),
	privateKey: text("private_key").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }),
	alg: text(),
	crv: text(),
});

export const menuItemRecipes = pgTable("menu_item_recipes", {
	id: uuid().defaultRandom().primaryKey(),
	menuItemId: uuid("menu_item_id").notNull().references(() => placeMenuItems.id, { onDelete: "cascade" } ),
	recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" } ),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
	index("idx_menu_item_recipes_menu_item_id").using("btree", table.menuItemId.asc().nullsLast()),
	index("idx_menu_item_recipes_recipe_id").using("btree", table.recipeId.asc().nullsLast()),
	unique("menu_item_recipes_menu_item_id_recipe_id_key").on(table.menuItemId, table.recipeId),]);

export const menuScans = pgTable("menu_scans", {
	id: uuid().defaultRandom().primaryKey(),
	userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	placeId: uuid("place_id").references(() => places.id, { onDelete: "set null" } ),
	originalImageId: uuid("original_image_id").notNull().references(() => files.id),
	processedImageId: uuid("processed_image_id").references(() => files.id),
	extractedText: text("extracted_text"),
	processingStatus: text("processing_status").default("pending").notNull(),
	processingError: text("processing_error"),
	confidenceScore: numeric("confidence_score", { precision: 3, scale: 2 }),
	scanLocation: geography("scan_location"),
	estimatedPlaceId: uuid("estimated_place_id").references(() => places.id),
	manualPlaceOverride: uuid("manual_place_override").references(() => places.id),
	processingModel: text("processing_model"),
	processingDurationMs: integer("processing_duration_ms"),
	itemsDetected: integer("items_detected").default(0),
	itemsMatched: integer("items_matched").default(0),
	scannedAt: timestamp("scanned_at", { withTimezone: true }).default(sql`now()`),
	processedAt: timestamp("processed_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
	index("idx_menu_scans_location").using("gist", table.scanLocation.asc().nullsLast()),
	index("idx_menu_scans_status").using("btree", table.processingStatus.asc().nullsLast()),
	index("idx_menu_scans_user").using("btree", table.userId.asc().nullsLast()),
check("menu_scans_processing_status_check", sql`(processing_status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text]))`),]);

export const outbox = pgTable("outbox", {
	id: uuid().defaultRandom().primaryKey(),
	// HAND-EDIT #6 (see ../../README.md): `pull` writes `mode: 'number'`, which
	// parses a bigint into a JS number and silently loses precision past 2^53.
	// A7b's ordering guarantee reads this column as a bigint.
	seq: bigserial({ mode: "bigint" }).notNull(),
	targetActor: text("target_actor").notNull(),
	targetId: text("target_id").notNull(),
	method: text().notNull(),
	payload: jsonb().default({}).notNull(),
	runAfter: timestamp("run_after", { withTimezone: true }).default(sql`now()`).notNull(),
	attempts: integer().default(0).notNull(),
	status: text().default("pending").notNull(),
	lastError: text("last_error"),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
	// Identifies *which* claim a `delivering` row is currently under, so the
	// deliverer that holds the claim is the only one whose outcome write lands.
	// Null except while `status = 'delivering'`. See `OutboxActor.#claimHeld`.
	claimToken: uuid("claim_token"),
	// Who caused this row to be enqueued, for `api_usage_log.triggered_by` and
	// nothing else — the delivery still runs as `systemCtx`, and no ctx or
	// policy ever reads this. See `BudgetActor.reserveForModel` and
	// `enqueueOutbox`'s `attributeTo`. Null for system-originated work.
	attributedTo: uuid("attributed_to"),
}, (table) => [
	// `OutboxActor.#reclaimStale`, every 2 seconds, was a seq scan: measured on
	// the compose stack at 598 rows it read 47 buffers to find nothing, and that
	// cost grows linearly with a table nothing ever deleted from. Partial rather
	// than a plain `(status, updated_at)`, because `delivering` is empty on a
	// healthy system — the index stays a page or two whatever the table does.
	index("outbox_delivering_idx").using("btree", table.updatedAt.asc().nullsLast()).where(sql`(status = 'delivering'::text)`),
	// Listed in catalog-creation order, not alphabetically: `pull` renders
	// indexes in the order Postgres returns them, and diffing a fresh pull
	// against this file (packages/db/transform/README.md's cutover `baseline`
	// phase) is line-for-line, so an alphabetical re-sort here would read as
	// schema drift that isn't. `06_new_tables.sql` recreates this one; the
	// other two are added later by the hand-written lane, hence this order.
	index("outbox_due_idx").using("btree", table.runAfter.asc().nullsLast(), table.seq.asc().nullsLast()).where(sql`(status = 'pending'::text)`),
	// The `WHERE NOT EXISTS` guard in `enqueueOutboxOnce`, which runs on the hot
	// path of every tier-list mutation. Partial for the same reason: it indexes
	// live work only, not the history.
	index("outbox_live_target_idx").using("btree", table.targetActor.asc().nullsLast(), table.targetId.asc().nullsLast(), table.method.asc().nullsLast()).where(sql`((status = 'pending'::text) OR (status = 'delivering'::text))`),
check("outbox_status_check", sql`(status = ANY (ARRAY['pending'::text, 'delivering'::text, 'delivered'::text, 'dead'::text]))`),]);

// HAND-ADDED (see ../../README.md and migrations/20260920164500_outbox_dead_letter_acks):
// created through the hand-written SQL lane, not `pull`. Columns, nullability,
// primary key and the ON DELETE CASCADE FK are copied verbatim from that
// migration's DDL. The FK is the plain `.references()` form — not a named
// `foreignKey()` builder — because that is the only form `pull` ever renders
// for a single-column FK (README.md's "Hand-edits" section, HAND-EDIT #7);
// a builder call here made the cutover's
// baseline diff (transform/README.md) fail on syntax alone, verified against
// a from-scratch build. The live constraint's own name is aligned to match
// what this declaration's default naming implies, not the other way around —
// see migrations/20260926150000_outbox_dead_letter_acks_fkey_align, the same
// treatment transform/07_align_constraint_names.sql gives every other
// single-column FK, just arriving from a table `07` runs too early to see.
export const outboxDeadLetterAcks = pgTable("outbox_dead_letter_acks", {
	outboxId: uuid("outbox_id").primaryKey().references(() => outbox.id, { onDelete: "cascade" } ),
	targetActor: text("target_actor").notNull(),
	method: text().notNull(),
	acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).default(sql`now()`).notNull(),
	acknowledgedBy: text("acknowledged_by").notNull(),
	note: text(),
}, (table) => [
	index("outbox_dead_letter_acks_pair_idx").using("btree", table.targetActor.asc().nullsLast(), table.method.asc().nullsLast()),
]);

export const placeBrands = pgTable("place_brands", {
	id: uuid().defaultRandom().primaryKey(),
	placeId: uuid("place_id").notNull().references(() => places.id, { onDelete: "cascade" } ),
	brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" } ),
	relationshipType: text("relationship_type").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
	index("idx_place_brands_brand_id").using("btree", table.brandId.asc().nullsLast()),
	index("idx_place_brands_place_id").using("btree", table.placeId.asc().nullsLast()),
	unique("place_brands_place_id_brand_id_key").on(table.placeId, table.brandId),check("place_brands_relationship_type_check", sql`(relationship_type = ANY (ARRAY['owned_by'::text, 'affiliated_with'::text, 'serves'::text]))`),]);

export const placeGoogleEnrichments = pgTable("place_google_enrichments", {
	placeId: uuid("place_id").primaryKey().references(() => places.id, { onDelete: "cascade" } ),
	googlePlaceId: text("google_place_id").notNull(),
	googleName: text("google_name"),
	googleFormattedAddress: text("google_formatted_address"),
	googleRating: real("google_rating"),
	googleUserRatingsTotal: integer("google_user_ratings_total"),
	googlePriceLevel: integer("google_price_level"),
	googleWebsite: text("google_website"),
	googlePhone: text("google_phone"),
	googleOpeningHours: jsonb("google_opening_hours"),
	googleTypes: text("google_types").array(),
	googleBusinessStatus: text("google_business_status"),
	googleEditorialSummary: text("google_editorial_summary"),
	photoReferences: jsonb("photo_references").default([]),
	attributions: jsonb().default([]),
	resolvedVia: text("resolved_via").notNull(),
	detailsFetchedAt: timestamp("details_fetched_at", { withTimezone: true }),
	photosFetchedAt: timestamp("photos_fetched_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	index("idx_pge_details_fetched_at").using("btree", table.detailsFetchedAt.asc().nullsLast()),
	index("idx_pge_google_place_id").using("btree", table.googlePlaceId.asc().nullsLast()),
	uniqueIndex("unique_google_place_id").using("btree", table.googlePlaceId.asc().nullsLast()),
check("place_google_enrichments_resolved_via_check", sql`(resolved_via = ANY (ARRAY['nearby_search'::text, 'autocomplete'::text, 'text_search'::text]))`),]);

export const placeGooglePhotos = pgTable("place_google_photos", {
	id: uuid().defaultRandom().primaryKey(),
	placeId: uuid("place_id").notNull().references(() => places.id, { onDelete: "cascade" } ),
	googlePhotoName: text("google_photo_name").notNull(),
	storageFileId: uuid("storage_file_id").references(() => files.id),
	width: integer(),
	height: integer(),
	attributions: jsonb().default([]).notNull(),
	displayOrder: integer("display_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	index("idx_pgp_place_id").using("btree", table.placeId.asc().nullsLast()),
	uniqueIndex("unique_place_photo").using("btree", table.placeId.asc().nullsLast(), table.googlePhotoName.asc().nullsLast()),
]);

export const placeMenuItems = pgTable("place_menu_items", {
	id: uuid().defaultRandom().primaryKey(),
	placeMenuId: uuid("place_menu_id").references(() => placeMenus.id, { onDelete: "cascade" } ),
	menuScanId: uuid("menu_scan_id").references(() => menuScans.id, { onDelete: "cascade" } ),
	placeId: uuid("place_id").notNull().references(() => places.id, { onDelete: "cascade" } ),
	menuItemName: text("menu_item_name").notNull(),
	menuItemDescription: text("menu_item_description"),
	menuItemPrice: numeric("menu_item_price", { precision: 10, scale: 2 }),
	menuCategory: text("menu_category"),
	detectedItemType: text("detected_item_type"),
	confidenceScore: numeric("confidence_score", { precision: 3, scale: 2 }),
	extractedAttributes: jsonb("extracted_attributes"),
	wineId: uuid("wine_id").references(() => wines.id, { onDelete: "set null" } ),
	beerId: uuid("beer_id").references(() => beers.id, { onDelete: "set null" } ),
	spiritId: uuid("spirit_id").references(() => spirits.id, { onDelete: "set null" } ),
	coffeeId: uuid("coffee_id").references(() => coffees.id, { onDelete: "set null" } ),
	matchVerifiedBy: uuid("match_verified_by").references(() => user.id),
	matchVerifiedAt: timestamp("match_verified_at", { withTimezone: true }),
	isAvailable: boolean("is_available").default(true),
	seasonal: boolean().default(false),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
	sakeId: uuid("sake_id").references(() => sakes.id, { onDelete: "set null" } ),
	teaId: uuid("tea_id").references(() => teas.id, { onDelete: "set null" } ),
	searchName: text("search_name"),
}, (table) => [
	index("idx_place_menu_items_menu").using("btree", table.placeMenuId.asc().nullsLast()),
	index("idx_place_menu_items_place").using("btree", table.placeId.asc().nullsLast()),
	index("idx_place_menu_items_scan").using("btree", table.menuScanId.asc().nullsLast()),
	index("idx_place_menu_items_type").using("btree", table.detectedItemType.asc().nullsLast()),
	index("idx_place_menu_items_unmatched").using("btree", table.wineId.asc().nullsLast(), table.beerId.asc().nullsLast(), table.spiritId.asc().nullsLast(), table.coffeeId.asc().nullsLast(), table.sakeId.asc().nullsLast(), table.teaId.asc().nullsLast()).where(sql`((wine_id IS NULL) AND (beer_id IS NULL) AND (spirit_id IS NULL) AND (coffee_id IS NULL) AND (sake_id IS NULL) AND (tea_id IS NULL))`),
check("check_menu_or_scan_source", sql`(num_nonnulls(place_menu_id, menu_scan_id) = 1)`),check("check_single_item_type", sql`(num_nonnulls(wine_id, beer_id, spirit_id, coffee_id, sake_id, tea_id) <= 1)`),check("place_menu_items_detected_item_type_check", sql`(detected_item_type = ANY (ARRAY['wine'::text, 'beer'::text, 'spirit'::text, 'coffee'::text, 'sake'::text, 'tea'::text, 'cocktail'::text, 'unknown'::text]))`),]);

export const placeMenus = pgTable("place_menus", {
	id: uuid().defaultRandom().primaryKey(),
	placeId: uuid("place_id").notNull().references(() => places.id, { onDelete: "cascade" } ),
	menuData: jsonb("menu_data").notNull(),
	menuType: text("menu_type"),
	source: text().notNull(),
	sourceUrl: text("source_url"),
	discoveryMethod: text("discovery_method"),
	confidenceScore: numeric("confidence_score", { precision: 3, scale: 2 }),
	version: integer().default(1),
	isCurrent: boolean("is_current").default(true),
	validFrom: timestamp("valid_from", { withTimezone: true }).default(sql`now()`),
	validUntil: timestamp("valid_until", { withTimezone: true }),
	createdBy: uuid("created_by").references(() => user.id),
	verifiedBy: uuid("verified_by").references(() => user.id),
	discoveredAt: timestamp("discovered_at", { withTimezone: true }).default(sql`now()`),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
	index("idx_place_menus_current").using("btree", table.placeId.asc().nullsLast(), table.isCurrent.asc().nullsLast()).where(sql`(is_current = true)`),
	uniqueIndex("idx_place_menus_current_unique").using("btree", table.placeId.asc().nullsLast(), table.menuType.asc().nullsLast()).where(sql`(is_current = true)`),
	index("idx_place_menus_place_id").using("btree", table.placeId.asc().nullsLast()),
	index("idx_place_menus_type").using("btree", table.menuType.asc().nullsLast()),
check("place_menus_menu_type_check", sql`(menu_type = ANY (ARRAY['food'::text, 'drinks'::text, 'wine'::text, 'beer'::text, 'cocktails'::text, 'coffee'::text]))`),check("place_menus_source_check", sql`(source = ANY (ARRAY['web_scrape'::text, 'api'::text, 'user_upload'::text, 'ai_generated'::text, 'camera_scan'::text]))`),]);

export const placeVectors = pgTable("place_vectors", {
	id: serial().primaryKey(),
	vector: halfvec({ dimensions: 768 }).notNull(),
	placeId: uuid("place_id").notNull().references(() => places.id, { onDelete: "cascade", onUpdate: "restrict" } ),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
	index("idx_place_vectors_hnsw").using("hnsw", table.vector.asc().nullsLast().op("halfvec_cosine_ops")).with({ "m": 16, "ef_construction": 64 }),
	index("idx_place_vectors_place_created").using("btree", table.placeId.asc().nullsLast(), table.createdAt.asc().nullsLast()),
	index("idx_place_vectors_place_id").using("btree", table.placeId.asc().nullsLast()),
]);

export const places = pgTable("places", {
	id: uuid().defaultRandom().primaryKey(),
	overtureId: text("overture_id"),
	name: text().notNull(),
	displayName: text("display_name"),
	categories: text().array().notNull(),
	confidence: numeric({ precision: 3, scale: 2 }),
	location: geography().notNull(),
	streetAddress: text("street_address"),
	locality: text(),
	region: text(),
	postcode: text(),
	countryCode: char("country_code", { length: 2 }),
	phone: text(),
	website: text(),
	email: text(),
	hours: jsonb(),
	priceLevel: integer("price_level"),
	rating: numeric({ precision: 2, scale: 1 }),
	reviewCount: integer("review_count").default(0),
	accessCount: integer("access_count").default(0),
	lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
	firstCachedReason: text("first_cached_reason"),
	sourceTags: jsonb("source_tags"),
	isVerified: boolean("is_verified").default(false),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
	lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
	primaryCategory: text("primary_category").generatedAlwaysAs(sql`categories[1]`),
	searchText: tsvector("search_text"),
	createdBy: uuid("created_by").references(() => user.id),
	source: text().default("overture").notNull(),
	description: text(),
	googlePlaceId: text("google_place_id"),
}, (table) => [
	index("idx_places_categories").using("gin", table.categories.asc().nullsLast()),
	index("idx_places_created_by_created_at").using("btree", table.createdBy.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
	uniqueIndex("idx_places_google_place_id").using("btree", table.googlePlaceId.asc().nullsLast()).where(sql`(google_place_id IS NOT NULL)`),
	index("idx_places_locality").using("btree", table.locality.asc().nullsLast()),
	index("idx_places_locality_trgm").using("gin", table.locality.asc().nullsLast().op("gin_trgm_ops")),
	index("idx_places_location").using("gist", table.location.asc().nullsLast()),
	index("idx_places_name_compact_trgm").using("gin", sql`regexp_replace(lower(name), '[^a-z0-9]'::text, ''::text, 'g'::text) gin_trgm_ops`),
	index("idx_places_name_trgm").using("gin", table.name.asc().nullsLast().op("gin_trgm_ops")),
	index("idx_places_primary_category").using("btree", table.primaryCategory.asc().nullsLast()),
	index("idx_places_search_text").using("gin", table.searchText.asc().nullsLast()),
	index("places_created_by_idx").using("btree", table.createdBy.asc().nullsLast()).where(sql`(created_by IS NOT NULL)`),
	index("places_source_idx").using("btree", table.source.asc().nullsLast()),
	unique("places_overture_id_key").on(table.overtureId),check("places_confidence_check", sql`((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))`),check("places_price_level_check", sql`((price_level >= 1) AND (price_level <= 4))`),check("places_rating_check", sql`((rating >= (0)::numeric) AND (rating <= (5)::numeric))`),check("places_source_check", sql`(source = ANY (ARRAY['overture'::text, 'user'::text, 'merged'::text]))`),]);

export const recipeGroups = pgTable("recipe_groups", {
	id: uuid().defaultRandom().primaryKey(),
	name: text().notNull(),
	description: text(),
	category: recipeCategory().notNull(),
	baseSpirit: text("base_spirit"),
	tags: text().array(),
	imageUrl: text("image_url"),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
	createdById: uuid("created_by_id").references(() => user.id, { onDelete: "set null" } ),
	canonicalRecipeId: uuid("canonical_recipe_id").references((): AnyPgColumn => recipes.id, { onDelete: "set null" } ),
}, (table) => [
	index("idx_recipe_groups_base_spirit").using("btree", table.baseSpirit.asc().nullsLast()),
	index("idx_recipe_groups_canonical_recipe").using("btree", table.canonicalRecipeId.asc().nullsLast()),
	index("idx_recipe_groups_category").using("btree", table.category.asc().nullsLast()),
	index("idx_recipe_groups_created_by").using("btree", table.createdById.asc().nullsLast()),
	index("idx_recipe_groups_tags").using("gin", table.tags.asc().nullsLast()),
check("recipe_groups_name_check", sql`(length(name) > 0)`),]);

export const recipeIngredients = pgTable("recipe_ingredients", {
	id: uuid().defaultRandom().primaryKey(),
	recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" } ),
	wineId: uuid("wine_id").references(() => wines.id),
	beerId: uuid("beer_id").references(() => beers.id),
	spiritId: uuid("spirit_id").references(() => spirits.id),
	coffeeId: uuid("coffee_id").references(() => coffees.id),
	genericItemId: uuid("generic_item_id").references(() => genericItems.id),
	quantity: numeric(),
	unit: text(),
	isOptional: boolean("is_optional").default(false),
	substitutionNotes: text("substitution_notes"),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	sakeId: uuid("sake_id").references(() => sakes.id),
	teaId: uuid("tea_id").references(() => teas.id),
}, (table) => [
	index("idx_recipe_ingredients_beer_id").using("btree", table.beerId.asc().nullsLast()),
	index("idx_recipe_ingredients_coffee_id").using("btree", table.coffeeId.asc().nullsLast()),
	index("idx_recipe_ingredients_generic_id").using("btree", table.genericItemId.asc().nullsLast()),
	index("idx_recipe_ingredients_recipe_id").using("btree", table.recipeId.asc().nullsLast()),
	index("idx_recipe_ingredients_sake_id").using("btree", table.sakeId.asc().nullsLast()),
	index("idx_recipe_ingredients_spirit_id").using("btree", table.spiritId.asc().nullsLast()),
	index("idx_recipe_ingredients_tea_id").using("btree", table.teaId.asc().nullsLast()),
	index("idx_recipe_ingredients_wine_id").using("btree", table.wineId.asc().nullsLast()),
check("exactly_one_item_reference", sql`(num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id, generic_item_id) = 1)`),]);

export const recipeInstructions = pgTable("recipe_instructions", {
	id: uuid().defaultRandom().primaryKey(),
	recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" } ),
	stepNumber: integer("step_number").notNull(),
	instructionText: text("instruction_text").notNull(),
	instructionType: instructionTypes("instruction_type"),
	equipmentNeeded: text("equipment_needed"),
	timeMinutes: integer("time_minutes"),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
	index("idx_recipe_instructions_recipe_id").using("btree", table.recipeId.asc().nullsLast()),
	index("idx_recipe_instructions_step").using("btree", table.recipeId.asc().nullsLast(), table.stepNumber.asc().nullsLast()),
	index("idx_recipe_instructions_type").using("btree", table.instructionType.asc().nullsLast()),
	unique("recipe_instructions_recipe_id_step_number_key").on(table.recipeId, table.stepNumber),]);

export const recipeReviews = pgTable("recipe_reviews", {
	id: uuid().defaultRandom().primaryKey(),
	recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade", onUpdate: "restrict" } ),
	userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade", onUpdate: "restrict" } ),
	score: real(),
	text: text(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	index("idx_recipe_reviews_created_at").using("btree", table.createdAt.asc().nullsLast()),
	index("idx_recipe_reviews_recipe_id").using("btree", table.recipeId.asc().nullsLast()),
	index("idx_recipe_reviews_score").using("btree", table.score.asc().nullsLast()),
	index("idx_recipe_reviews_user_id").using("btree", table.userId.asc().nullsLast()),
	unique("recipe_reviews_unique_user_recipe").on(table.recipeId, table.userId),check("recipe_reviews_score_range", sql`((score IS NULL) OR (score = ANY (ARRAY[(0.5)::double precision, ((1)::numeric)::double precision, (1.5)::double precision, ((2)::numeric)::double precision, (2.5)::double precision, ((3)::numeric)::double precision, (3.5)::double precision, ((4)::numeric)::double precision, (4.5)::double precision, ((5)::numeric)::double precision])))`),]);

export const recipeVectors = pgTable("recipe_vectors", {
	id: serial().primaryKey(),
	vector: halfvec({ dimensions: 768 }).notNull(),
	recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade", onUpdate: "restrict" } ),
	embeddingText: text("embedding_text"),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
	embeddingModel: text("embedding_model"),
	embeddingImages: text("embedding_images"),
}, (table) => [
	index("idx_recipe_vectors_hnsw_cosine").using("hnsw", table.vector.asc().nullsLast().op("halfvec_cosine_ops")).with({ "m": 16, "ef_construction": 64 }),
	uniqueIndex("idx_recipe_vectors_recipe_id").using("btree", table.recipeId.asc().nullsLast()),
]);

export const recipeVotes = pgTable("recipe_votes", {
	id: uuid().defaultRandom().primaryKey(),
	recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" } ),
	userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	voteType: text("vote_type").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
	index("idx_recipe_votes_recipe_id").using("btree", table.recipeId.asc().nullsLast()),
	index("idx_recipe_votes_user_id").using("btree", table.userId.asc().nullsLast()),
	index("idx_recipe_votes_vote_type").using("btree", table.voteType.asc().nullsLast()),
	unique("recipe_votes_recipe_id_user_id_key").on(table.recipeId, table.userId),check("recipe_votes_vote_type_check", sql`(vote_type = ANY (ARRAY['upvote'::text, 'downvote'::text]))`),]);

export const recipes = pgTable("recipes", {
	id: uuid().defaultRandom().primaryKey(),
	name: text().notNull(),
	description: text(),
	type: text().notNull(),
	canonicalRecipeId: uuid("canonical_recipe_id"),
	difficultyLevel: integer("difficulty_level"),
	prepTimeMinutes: integer("prep_time_minutes"),
	servingSize: integer("serving_size"),
	imageUrl: text("image_url"),
	version: integer().default(1),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
	recipeGroupId: uuid("recipe_group_id").references((): AnyPgColumn => recipeGroups.id, { onDelete: "set null" } ),
	createdById: uuid("created_by_id").references(() => user.id, { onDelete: "set null" } ),
}, (table) => [
	foreignKey({
		columns: [table.canonicalRecipeId],
		foreignColumns: [table.id],
		name: "recipes_canonical_recipe_id_recipes_id_fkey"
	}),
	index("idx_recipes_canonical").using("btree", table.canonicalRecipeId.asc().nullsLast()),
	index("idx_recipes_created_by").using("btree", table.createdById.asc().nullsLast()),
	index("idx_recipes_difficulty").using("btree", table.difficultyLevel.asc().nullsLast()),
	index("idx_recipes_group_id").using("btree", table.recipeGroupId.asc().nullsLast()),
	index("idx_recipes_name").using("btree", table.name.asc().nullsLast()),
	index("idx_recipes_type").using("btree", table.type.asc().nullsLast()),
check("recipes_difficulty_level_check", sql`((difficulty_level >= 1) AND (difficulty_level <= 5))`),check("recipes_type_check", sql`(type = ANY (ARRAY['food'::text, 'cocktail'::text]))`),]);

export const sakeCategory = pgTable("sake_category", {
	value: text().primaryKey(),
	comment: text(),
});

export const sakeRiceVariety = pgTable("sake_rice_variety", {
	value: text().primaryKey(),
	comment: text(),
});

export const sakeType = pgTable("sake_type", {
	value: text().primaryKey(),
	comment: text(),
});

export const sakes = pgTable("sakes", {
	id: uuid().defaultRandom().primaryKey(),
	name: text().notNull(),
	description: text(),
	createdById: uuid("created_by_id").notNull().references(() => user.id),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
	region: text(),
	category: text().references(() => sakeCategory.value),
	type: text().references(() => sakeType.value),
	polishGrade: numeric("polish_grade", { precision: 4, scale: 2 }),
	alcoholContentPercentage: numeric("alcohol_content_percentage", { precision: 4, scale: 2 }),
	servingTemperature: sakeServingTemperature("serving_temperature"),
	riceVariety: text("rice_variety").references(() => sakeRiceVariety.value),
	yeastStrain: text("yeast_strain"),
	sakeMeterValue: numeric("sake_meter_value", { precision: 4, scale: 2 }),
	acidity: numeric({ precision: 4, scale: 2 }),
	aminoAcid: numeric("amino_acid", { precision: 4, scale: 2 }),
	vintage: integer(),
	country: text().references(() => country.value),
	barcodeCode: text("barcode_code").references(() => barcodes.code),
	itemOnboardingId: uuid("item_onboarding_id"),
}, (table) => [
	index("idx_sakes_category").using("btree", table.category.asc().nullsLast()),
	index("idx_sakes_created_by").using("btree", table.createdById.asc().nullsLast()),
	index("idx_sakes_name").using("btree", table.name.asc().nullsLast()),
	index("idx_sakes_polish_grade").using("btree", table.polishGrade.asc().nullsLast()),
	index("idx_sakes_region").using("btree", table.region.asc().nullsLast()),
	index("idx_sakes_type").using("btree", table.type.asc().nullsLast()),
	index("idx_sakes_vintage").using("btree", table.vintage.asc().nullsLast()),
]);

export const session = pgTable("session", {
	id: uuid().primaryKey(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	token: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
}, (table) => [
	uniqueIndex("session_token_key").using("btree", table.token.asc().nullsLast()),
	index("session_user_id_idx").using("btree", table.userId.asc().nullsLast()),
]);

export const spiritType = pgTable("spirit_type", {
	value: text().primaryKey(),
	comment: text(),
});

export const spirits = pgTable("spirits", {
	id: uuid().defaultRandom().primaryKey(),
	name: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
	createdById: uuid("created_by_id").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	type: text().notNull().references(() => spiritType.value),
	vintage: date(),
	description: text(),
	alcoholContentPercentage: numeric("alcohol_content_percentage"),
	style: text(),
	barcodeCode: text("barcode_code").references(() => barcodes.code, { onDelete: "restrict", onUpdate: "restrict" } ),
	country: text().references(() => country.value),
	itemOnboardingId: uuid("item_onboarding_id").notNull().references(() => itemOnboardings.id, { onDelete: "restrict", onUpdate: "restrict" } ),
}, (table) => [
check("Alcohol content percentage greater than 0 and less than 100", sql`((alcohol_content_percentage >= (0)::numeric) AND (alcohol_content_percentage <= (100)::numeric))`),]);

export const teaCategory = pgTable("tea_category", {
	value: text().primaryKey(),
	comment: text(),
});

export const teas = pgTable("teas", {
	id: uuid().defaultRandom().primaryKey(),
	name: text().notNull(),
	description: text(),
	createdById: uuid("created_by_id").notNull().references(() => user.id),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
	category: text().references(() => teaCategory.value),
	form: teaForm(),
	caffeineLevel: teaCaffeineLevel("caffeine_level"),
	region: text(),
	country: text().references(() => country.value),
	cultivar: text(),
	oxidationLevel: text("oxidation_level"),
	processing: text(),
	harvestYear: integer("harvest_year"),
	ingredients: text(),
	steepingTemperature: text("steeping_temperature"),
	steepingTime: text("steeping_time"),
	flavorProfile: text("flavor_profile"),
	isOrganic: boolean("is_organic"),
	isFairTrade: boolean("is_fair_trade"),
	barcodeCode: text("barcode_code").references(() => barcodes.code),
	itemOnboardingId: uuid("item_onboarding_id"),
}, (table) => [
	index("idx_teas_category").using("btree", table.category.asc().nullsLast()),
	index("idx_teas_created_by").using("btree", table.createdById.asc().nullsLast()),
	index("idx_teas_name").using("btree", table.name.asc().nullsLast()),
	index("idx_teas_region").using("btree", table.region.asc().nullsLast()),
]);

export const tierListItems = pgTable("tier_list_items", {
	id: uuid().defaultRandom().primaryKey(),
	tierListId: uuid("tier_list_id").notNull().references(() => tierLists.id, { onDelete: "cascade" } ),
	band: integer().default(0).notNull(),
	position: integer().default(0).notNull(),
	notes: text(),
	placeId: uuid("place_id").references(() => places.id),
	wineId: uuid("wine_id").references(() => wines.id),
	beerId: uuid("beer_id").references(() => beers.id),
	spiritId: uuid("spirit_id").references(() => spirits.id),
	coffeeId: uuid("coffee_id").references(() => coffees.id),
	sakeId: uuid("sake_id").references(() => sakes.id),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
	teaId: uuid("tea_id").references(() => teas.id),
	type: text().generatedAlwaysAs(sql`
CASE
    WHEN (place_id IS NOT NULL) THEN 'PLACE'::text
    WHEN (beer_id IS NOT NULL) THEN 'BEER'::text
    WHEN (wine_id IS NOT NULL) THEN 'WINE'::text
    WHEN (coffee_id IS NOT NULL) THEN 'COFFEE'::text
    WHEN (sake_id IS NOT NULL) THEN 'SAKE'::text
    WHEN (tea_id IS NOT NULL) THEN 'TEA'::text
    WHEN (spirit_id IS NOT NULL) THEN 'SPIRIT'::text
    ELSE NULL::text
END`),
}, (table) => [
	index("idx_tier_list_items_beer_id").using("btree", table.beerId.asc().nullsLast()).where(sql`(beer_id IS NOT NULL)`),
	index("idx_tier_list_items_coffee_id").using("btree", table.coffeeId.asc().nullsLast()).where(sql`(coffee_id IS NOT NULL)`),
	index("idx_tier_list_items_place_id_tier_list_id").using("btree", table.placeId.asc().nullsLast(), table.tierListId.asc().nullsLast()),
	index("idx_tier_list_items_sake_id").using("btree", table.sakeId.asc().nullsLast()).where(sql`(sake_id IS NOT NULL)`),
	index("idx_tier_list_items_spirit_id").using("btree", table.spiritId.asc().nullsLast()).where(sql`(spirit_id IS NOT NULL)`),
	index("idx_tier_list_items_tea_id").using("btree", table.teaId.asc().nullsLast()).where(sql`(tea_id IS NOT NULL)`),
	index("idx_tier_list_items_wine_id").using("btree", table.wineId.asc().nullsLast()).where(sql`(wine_id IS NOT NULL)`),
	index("tier_list_items_place_id_idx").using("btree", table.placeId.asc().nullsLast()),
	index("tier_list_items_tier_list_id_band_position_idx").using("btree", table.tierListId.asc().nullsLast(), table.band.desc().nullsFirst(), table.position.asc().nullsLast()),
	index("tier_list_items_tier_list_id_idx").using("btree", table.tierListId.asc().nullsLast()),
	unique("unique_beer_in_tier_list").on(table.tierListId, table.beerId),	unique("unique_coffee_in_tier_list").on(table.tierListId, table.coffeeId),	unique("unique_place_in_tier_list").on(table.tierListId, table.placeId),	unique("unique_sake_in_tier_list").on(table.tierListId, table.sakeId),	unique("unique_spirit_in_tier_list").on(table.tierListId, table.spiritId),	unique("unique_tea_in_tier_list").on(table.tierListId, table.teaId),	unique("unique_wine_in_tier_list").on(table.tierListId, table.wineId),check("exactly_one_tier_item_reference", sql`(num_nonnulls(place_id, wine_id, beer_id, spirit_id, coffee_id, sake_id, tea_id) = 1)`),check("tier_list_items_band_check", sql`((band >= 0) AND (band <= 5))`),]);

export const tierLists = pgTable("tier_lists", {
	id: uuid().defaultRandom().primaryKey(),
	name: text().notNull(),
	description: text(),
	createdById: uuid("created_by_id").notNull().references(() => user.id),
	privacy: permissionType().default("PRIVATE").notNull(),
	listType: text("list_type").default("place").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
	contentUpdatedAt: timestamp("content_updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
	aiInsights: jsonb("ai_insights"),
	insightsGeneratedAt: timestamp("insights_generated_at", { withTimezone: true }),
	isEditingLocked: boolean("is_editing_locked").default(false).notNull(),
}, (table) => [
	index("tier_lists_created_by_id_idx").using("btree", table.createdById.asc().nullsLast()),
	index("tier_lists_privacy_idx").using("btree", table.privacy.asc().nullsLast()),
]);

export const user = pgTable("user", {
	id: uuid().primaryKey(),
	name: text().notNull(),
	email: text().notNull(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
	role: text().default("user").notNull(),
	locale: text(),
	disabled: boolean().default(false).notNull(),
}, (table) => [
	uniqueIndex("user_email_key").using("btree", table.email.asc().nullsLast()),
]);

export const userPlaceInteractions = pgTable("user_place_interactions", {
	id: uuid().defaultRandom().primaryKey(),
	userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	placeId: uuid("place_id").notNull().references(() => places.id, { onDelete: "cascade" } ),
	isFavorite: boolean("is_favorite").default(false),
	isVisited: boolean("is_visited").default(false),
	wantToVisit: boolean("want_to_visit").default(false),
	rating: integer(),
	notes: text(),
	tags: text().array(),
	lastVisitedAt: timestamp("last_visited_at", { withTimezone: true }),
	visitCount: integer("visit_count").default(0),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
	index("idx_user_place_interactions_favorites").using("btree", table.userId.asc().nullsLast(), table.isFavorite.asc().nullsLast()).where(sql`(is_favorite = true)`),
	index("idx_user_place_interactions_place").using("btree", table.placeId.asc().nullsLast()),
	index("idx_user_place_interactions_user").using("btree", table.userId.asc().nullsLast()),
	index("idx_user_place_interactions_visited").using("btree", table.userId.asc().nullsLast(), table.isVisited.asc().nullsLast()).where(sql`(is_visited = true)`),
	index("idx_user_place_interactions_want_to_visit").using("btree", table.userId.asc().nullsLast(), table.wantToVisit.asc().nullsLast()).where(sql`(want_to_visit = true)`),
	unique("unique_user_place").on(table.userId, table.placeId),check("user_place_interactions_rating_check", sql`((rating >= 1) AND (rating <= 5))`),]);

export const verification = pgTable("verification", {
	id: uuid().primaryKey(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	index("verification_identifier_idx").using("btree", table.identifier.asc().nullsLast()),
]);

export const wineStyle = pgTable("wine_style", {
	value: text().primaryKey(),
	comment: text(),
});

export const wineVariety = pgTable("wine_variety", {
	value: text().primaryKey(),
	comment: text(),
});

export const wines = pgTable("wines", {
	id: uuid().defaultRandom().primaryKey(),
	name: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
	createdById: uuid("created_by_id").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "restrict" } ),
	vintage: date().notNull(),
	variety: text().references(() => wineVariety.value),
	region: text(),
	wineryId: uuid("winery_id"),
	description: text(),
	specialDesignation: text("special_designation"),
	vineyardDesignation: text("vineyard_designation"),
	alcoholContentPercentage: numeric("alcohol_content_percentage"),
	barcodeCode: text("barcode_code").references(() => barcodes.code, { onDelete: "restrict", onUpdate: "restrict" } ),
	style: text().notNull().references(() => wineStyle.value),
	country: text().references(() => country.value),
	itemOnboardingId: uuid("item_onboarding_id").notNull().references(() => itemOnboardings.id, { onDelete: "restrict", onUpdate: "restrict" } ),
}, (table) => [
check("Alcohol content percentage greater than 0 and less than 100", sql`((alcohol_content_percentage >= (0)::numeric) AND (alcohol_content_percentage <= (100)::numeric))`),]);
