import { initGraphQLTada } from "gql.tada";
import type { introspection } from "./graphql-env.d.ts";

// =============================================================================
// GraphQL Configuration
// =============================================================================

export const graphql = initGraphQLTada<{
  introspection: introspection;
  scalars: {
    date: string;
    money: number;
    float8: number;
    bigint: number;
    numeric: number;
    uuid: string;
    smallint: number;
    json: string;
    timestamptz: string;
    vector: string;
  };
}>();

// Re-export gql.tada utilities
export type { FragmentOf, ResultOf, VariablesOf } from "gql.tada";
export { readFragment } from "gql.tada";

// =============================================================================
// Application Enums
// =============================================================================

/**
 * Single source of truth for item types
 *
 * @example
 * // Use ITEM_TYPES array for iteration/validation
 * ITEM_TYPES.forEach(type => ...)
 * ITEM_TYPES.includes(value)
 *
 * // Use ItemTypeValue for type annotations
 * function process(type: ItemTypeValue) { ... }
 *
 * // Or use string literals directly
 * const type: ItemTypeValue = "WINE";
 */
export const ITEM_TYPES = ["WINE", "BEER", "SPIRIT", "COFFEE", "SAKE"] as const;

export type ItemTypeValue = (typeof ITEM_TYPES)[number];

// =============================================================================
// GraphQL Enum Types (from schema)
// =============================================================================

export type BrandType = ReturnType<typeof graphql.scalar<"brand_types_enum">>;
export type InstructionType = ReturnType<
  typeof graphql.scalar<"instruction_types_enum">
>;

// Enum value types (for use as JavaScript values)
export type Brand_Types_Enum =
  introspection["types"]["brand_types_enum"]["enumValues"];
export type Instruction_Types_Enum =
  introspection["types"]["instruction_types_enum"]["enumValues"];
export type Country_Enum = introspection["types"]["country_enum"]["enumValues"];
export type Wine_Style_Enum =
  introspection["types"]["wine_style_enum"]["enumValues"];
export type Wine_Variety_Enum =
  introspection["types"]["wine_variety_enum"]["enumValues"];
export type Beer_Style_Enum =
  introspection["types"]["beer_style_enum"]["enumValues"];
export type Spirit_Type_Enum =
  introspection["types"]["spirit_type_enum"]["enumValues"];
export type Coffee_Roast_Level_Enum =
  introspection["types"]["coffee_roast_level_enum"]["enumValues"];
export type Coffee_Species_Enum =
  introspection["types"]["coffee_species_enum"]["enumValues"];
export type Coffee_Cultivar_Enum =
  introspection["types"]["coffee_cultivar_enum"]["enumValues"];
export type Coffee_Process_Enum =
  introspection["types"]["coffee_process_enum"]["enumValues"];
export type Permission_Type_Enum =
  introspection["types"]["permission_type_enum"]["enumValues"];

// Sake types are strings since they're stored in tables, not GraphQL enums
export type Sake_Category_Enum = string;
export type Sake_Type_Enum = string;
export type Sake_Serving_Temperature_Enum = string;
export type Sake_Rice_Variety_Enum = string;

// Constraint enum values
export const Barcodes_Constraint = {
  BarcodesPkey: "barcodes_pkey" as const,
} as const;
export type Barcodes_Constraint =
  (typeof Barcodes_Constraint)[keyof typeof Barcodes_Constraint];

export const Barcodes_Update_Column = {
  Code: "code" as const,
  Type: "type" as const,
} as const;
export type Barcodes_Update_Column =
  (typeof Barcodes_Update_Column)[keyof typeof Barcodes_Update_Column];

// GraphQL generated types that might be missing
export type Item_Image = Record<string, unknown>; // Placeholder for GraphQL generated type
export type Beers = Record<string, unknown>; // Placeholder for GraphQL generated type
export type Wines = Record<string, unknown>; // Placeholder for GraphQL generated type
export type Spirits = Record<string, unknown>; // Placeholder for GraphQL generated type
export type Coffees = Record<string, unknown>; // Placeholder for GraphQL generated type
export type Item_Vectors_Bool_Exp = Record<string, unknown>; // Placeholder for GraphQL generated type
export type Beer_Defaults_Result = Record<string, unknown>; // Placeholder for GraphQL generated type
export type Wine_Defaults_Result = Record<string, unknown>; // Placeholder for GraphQL generated type
export type Spirit_Defaults_Result = Record<string, unknown>; // Placeholder for GraphQL generated type
export type Coffee_Defaults_Result = Record<string, unknown>; // Placeholder for GraphQL generated type
export type Query_RootWine_DefaultsArgs = Record<string, unknown>; // Placeholder for GraphQL generated type
export type Item_Score_Bool_Exp_Bool_Exp = Record<string, unknown>; // Placeholder for GraphQL generated type

// Removed obsolete enum types - only brand_types_enum and instruction_types_enum are available

// =============================================================================
// GraphQL Input Types
// =============================================================================

// NOTE: Input types are now extracted using VariablesOf from actual mutations
// This ensures proper type safety and avoids complex introspection type mapping
// See queries/index.ts for the actual mutation definitions

// =============================================================================
// Webhook Payload Types
// =============================================================================

// Generic webhook payload structure for Hasura
export type WebhookPayload<T> = {
  event: {
    data: {
      new: T;
      old?: T;
    };
  };
};

// Utility to map GraphQL scalar types to TypeScript types
type ScalarMap = {
  String: string;
  Int: number;
  Float: number;
  Boolean: boolean;
  uuid: string;
  timestamptz: string;
  date: string;
  numeric: number;
  bigint: number;
  smallint: number;
  float8: number;
  json: Record<string, unknown>;
  jsonb: Record<string, unknown>;
  vector: string;
};

// Extract actual table row types from introspection with proper scalar mapping
type ExtractTableRow<T> = T extends { kind: "OBJECT"; fields: infer F }
  ? {
      [K in keyof F]: F[K] extends {
        type: { kind: "NON_NULL"; ofType: { kind: "SCALAR"; name: infer S } };
      }
        ? S extends keyof ScalarMap
          ? ScalarMap[S]
          : unknown
        : F[K] extends {
              type: { kind: "SCALAR"; name: infer S };
            }
          ? S extends keyof ScalarMap
            ? ScalarMap[S] | null
            : unknown
          : F[K] extends {
                type: {
                  kind: "NON_NULL";
                  ofType: { kind: "ENUM"; name: string };
                };
              }
            ? string
            : F[K] extends {
                  type: { kind: "ENUM"; name: string };
                }
              ? string | null
              : unknown;
    }
  : never;

// Generic type to get properly typed table rows from any table
export type TableRow<TableName extends keyof introspection["types"]> =
  ExtractTableRow<introspection["types"][TableName]>;

// =============================================================================
// Common Table Row Types
// =============================================================================

export type FriendRequestRow = TableRow<"friend_requests">;
export type UserRow = TableRow<"users">;
export type CellarItemRow = TableRow<"cellar_items">;
export type BeerRow = TableRow<"beers">;
export type WineRow = TableRow<"wines">;
export type SpiritRow = TableRow<"spirits">;
export type CoffeeRow = TableRow<"coffees">;
export type SakeRow = TableRow<"sakes">;

// =============================================================================
// Runtime Enum Queries
// =============================================================================

export const getCountryEnumQuery = graphql(`
  query GetCountryEnum {
    __type(name: "country_enum") {
      enumValues {
        name
      }
    }
  }
`);

export const getWineStyleEnumQuery = graphql(`
  query GetWineStyleEnum {
    __type(name: "wine_style_enum") {
      enumValues {
        name
      }
    }
  }
`);

export const getWineVarietyEnumQuery = graphql(`
  query GetWineVarietyEnum {
    __type(name: "wine_variety_enum") {
      enumValues {
        name
      }
    }
  }
`);

export const getSpiritTypeEnumQuery = graphql(`
  query GetSpiritTypeEnum {
    __type(name: "spirit_type_enum") {
      enumValues {
        name
      }
    }
  }
`);

export const getSakeCategoryEnumQuery = graphql(`
  query GetSakeCategoryEnum {
    __type(name: "sake_category_enum") {
      enumValues {
        name
      }
    }
  }
`);

export const getSakeTypeEnumQuery = graphql(`
  query GetSakeTypeEnum {
    __type(name: "sake_type_enum") {
      enumValues {
        name
      }
    }
  }
`);

export const getSakeServingTemperatureEnumQuery = graphql(`
  query GetSakeServingTemperatureEnum {
    __type(name: "sake_serving_temperature_enum") {
      enumValues {
        name
      }
    }
  }
`);

export const getSakeRiceVarietyEnumQuery = graphql(`
  query GetSakeRiceVarietyEnum {
    __type(name: "sake_rice_variety_enum") {
      enumValues {
        name
      }
    }
  }
`);
