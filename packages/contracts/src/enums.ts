/**
 * §4's twelve `pgEnum`s, as plain value arrays — services/api's Pothos enum types
 * read from these, not from `@cellar-assistant/db` (A7: "the API process has
 * no database connection string", and §8.3's `drizzle-orm`
 * physically-distinct-install trap applies to any import from `packages/db`,
 * not only operators). `item.ts`'s `ItemTypeEnum` already does this for
 * `item_type` (`ITEM_TYPES` in `items.ts`) — everything here is the other
 * eleven, in the exact order `packages/db/src/schema/tables.ts` declares them
 * (alphabetical; §4's correction: "Enum value order is alphabetical … the
 * only ordering that leaves existing `ORDER BY` results unchanged").
 *
 * A9 owns adding these so every `pgEnum` has a GraphQL type (acceptance:
 * "the `pgEnum` types appear in the schema snapshot"). Wiring one onto an
 * actual object field (e.g. `Coffee.roastLevel` moving off `String`) is a B2+
 * change, not this one — Pothos includes every `enumType` it builds in the
 * schema's type map regardless of field usage (`SchemaBuilder.toSchema`
 * passes every built type to `new GraphQLSchema({ types: … })`), so an enum
 * declared but not yet wired to a field still round-trips through
 * `printSchema`.
 */

export const PERMISSION_TYPES = ["FRIENDS", "PRIVATE", "PUBLIC"] as const;
export type PermissionType = (typeof PERMISSION_TYPES)[number];

export const FRIEND_REQUEST_STATUSES = ["ACCEPTED", "PENDING"] as const;
export type FriendRequestStatus = (typeof FRIEND_REQUEST_STATUSES)[number];

export const INSTRUCTION_TYPES = [
  "chill",
  "cook",
  "garnish",
  "mix",
  "prep",
  "serve",
] as const;
export type InstructionType = (typeof INSTRUCTION_TYPES)[number];

export const BRAND_TYPES = [
  "brewery",
  "distillery",
  "kura",
  "manufacturer",
  "other",
  "restaurant_chain",
  "roastery",
  "tea_house",
  "winery",
] as const;
export type BrandType = (typeof BRAND_TYPES)[number];

export const RECIPE_CATEGORIES = [
  "cocktail",
  "mocktail",
  "other",
  "punch",
  "shot",
] as const;
export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

export const COFFEE_ROAST_LEVELS = [
  "DARK",
  "EXTRA_DARK",
  "LIGHT",
  "LIGHT_MEDIUM",
  "MEDIUM",
  "MEDIUM_DARK",
] as const;
export type CoffeeRoastLevel = (typeof COFFEE_ROAST_LEVELS)[number];

export const COFFEE_PROCESSES = [
  "HONEY",
  "NATURAL_DRY",
  "PULPED_NATURAL",
  "PULPED_NATURAL_HONEY",
  "WASHED",
  "WET_HULLED",
] as const;
export type CoffeeProcess = (typeof COFFEE_PROCESSES)[number];

export const COFFEE_SPECIES = [
  "ARABICA",
  "CHARRIERIANA",
  "LIBERICA",
  "ROBUSTA",
  "STENOPHYLLA",
] as const;
export type CoffeeSpecies = (typeof COFFEE_SPECIES)[number];

export const TEA_CAFFEINE_LEVELS = [
  "decaf",
  "high",
  "low",
  "medium",
  "none",
] as const;
export type TeaCaffeineLevel = (typeof TEA_CAFFEINE_LEVELS)[number];

export const TEA_FORMS = [
  "brick",
  "instant",
  "loose_leaf",
  "matcha_powder",
  "sachet",
  "tea_bag",
] as const;
export type TeaForm = (typeof TEA_FORMS)[number];

export const SAKE_SERVING_TEMPERATURES = [
  "atsu_kan",
  "hitohada_kan",
  "hiya",
  "jo_kan",
  "nuru_kan",
  "rei_shu",
  "room_temperature",
  "tobikiri_kan",
  "yuki_hie",
] as const;
export type SakeServingTemperature = (typeof SAKE_SERVING_TEMPERATURES)[number];
