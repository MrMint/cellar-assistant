/**
 * GraphQL enum types for §4's twelve `pgEnum`s (A9).
 *
 * `item_type` already has a GraphQL type — `ItemTypeEnum` in `item.ts`. This
 * module is the other eleven, so every `pgEnum` in
 * `packages/db/src/schema/tables.ts` has a corresponding
 * `builder.enumType(...)` call somewhere in this app.
 *
 * None of these are wired onto an object field yet — the columns that use
 * them (`coffees.roast_level`, `sakes.serving_temperature`, …) are still
 * exposed as plain `String` in `item.ts` because **B2 owns `ItemActor`** and
 * changing a field's GraphQL type is its call, not A9's ("Move an entry
 * across the line when the code's use of it disagrees with the
 * classification" — §4 — is about the Postgres/Drizzle side; the GraphQL
 * field type is a separate, later decision for whichever workstream owns that
 * field). They still belong in the schema now, because the acceptance
 * criterion is the *type* existing, and Pothos includes every built type in
 * the schema regardless of whether a field references it yet —
 * `SchemaBuilder.toSchema()` passes every type it built to
 * `new GraphQLSchema({ types })`, which is how `Wine`/`Beer`/… (interface
 * implementations with no field of their own type) already show up in
 * `packages/schema/schema.graphql` today.
 *
 * Value order matches `tables.ts`'s `pgEnum(...)` call for each — alphabetical,
 * per the transform's own note (`packages/db/transform/04_enum_split.sql`):
 * "Enum order is the sort order, so alphabetical is the only choice that
 * leaves existing `ORDER BY` results unchanged."
 */
import {
  BRAND_TYPES,
  COFFEE_PROCESSES,
  COFFEE_ROAST_LEVELS,
  COFFEE_SPECIES,
  FRIEND_REQUEST_STATUSES,
  INSTRUCTION_TYPES,
  PERMISSION_TYPES,
  RECIPE_CATEGORIES,
  SAKE_SERVING_TEMPERATURES,
  TEA_CAFFEINE_LEVELS,
  TEA_FORMS,
} from "@cellar-assistant/contracts";
import { builder } from "./builder.ts";

export const PermissionTypeEnum = builder.enumType("PermissionType", {
  description:
    "The `permission_type` Postgres enum (`cellars`/`tier_lists` privacy).",
  values: PERMISSION_TYPES,
});

export const FriendRequestStatusEnum = builder.enumType("FriendRequestStatus", {
  description: "The `friend_request_status` Postgres enum.",
  values: FRIEND_REQUEST_STATUSES,
});

export const InstructionTypeEnum = builder.enumType("InstructionType", {
  description:
    "The `instruction_types` Postgres enum (`recipe_instructions.instruction_type`). " +
    "Keyed on `id` in the pre-A3 Hasura table this enum replaces.",
  values: INSTRUCTION_TYPES,
});

export const BrandTypeEnum = builder.enumType("BrandType", {
  description:
    "The `brand_types` Postgres enum (`brands.brand_type`). Keyed on `id` in " +
    "the pre-A3 Hasura table this enum replaces.",
  values: BRAND_TYPES,
});

export const RecipeCategoryEnum = builder.enumType("RecipeCategory", {
  description:
    "The `recipe_category` Postgres enum (`recipe_groups.category`).",
  values: RECIPE_CATEGORIES,
});

export const CoffeeRoastLevelEnum = builder.enumType("CoffeeRoastLevel", {
  description:
    "The `coffee_roast_level` Postgres enum (`coffees.roast_level`).",
  values: COFFEE_ROAST_LEVELS,
});

export const CoffeeProcessEnum = builder.enumType("CoffeeProcess", {
  description: "The `coffee_process` Postgres enum (`coffees.process`).",
  values: COFFEE_PROCESSES,
});

export const CoffeeSpeciesEnum = builder.enumType("CoffeeSpecies", {
  description: "The `coffee_species` Postgres enum (`coffees.species`).",
  values: COFFEE_SPECIES,
});

export const TeaCaffeineLevelEnum = builder.enumType("TeaCaffeineLevel", {
  description:
    "The `tea_caffeine_level` Postgres enum (`teas.caffeine_level`).",
  values: TEA_CAFFEINE_LEVELS,
});

export const TeaFormEnum = builder.enumType("TeaForm", {
  description: "The `tea_form` Postgres enum (`teas.form`).",
  values: TEA_FORMS,
});

export const SakeServingTemperatureEnum = builder.enumType(
  "SakeServingTemperature",
  {
    description:
      "The `sake_serving_temperature` Postgres enum (`sakes.serving_temperature`).",
    values: SAKE_SERVING_TEMPERATURES,
  },
);
