import type { introspection } from "../gql/graphql-env.d.ts";
import {
  formatBeerStyle,
  formatCountry,
  formatEnum,
  formatSakeCategory,
  formatSakeRiceVariety,
  formatSakeServingTemperature,
  formatSakeType,
  formatSpiritType,
  formatWineStyle,
  formatWineVariety,
} from "../utility/index";

export interface EnumConfig<T extends string = string> {
  name: string;
  graphqlType: keyof introspection["types"];
  formatFn?: (value: T) => string | undefined;
  category?: "item" | "location" | "permission" | "other";
}

export const ENUM_REGISTRY = {
  brandType: {
    name: "Brand Type",
    graphqlType: "brand_types_enum",
    formatFn: formatEnum,
    category: "item",
  },
  instructionType: {
    name: "Instruction Type",
    graphqlType: "instruction_types_enum",
    formatFn: formatEnum,
    category: "other",
  },
  country: {
    name: "Country",
    graphqlType: "country_enum",
    formatFn: formatCountry,
    category: "location",
  },
  permission: {
    name: "Permission",
    graphqlType: "permission_type_enum",
    formatFn: formatEnum,
    category: "permission",
  },
  // Wine enums
  wineStyle: {
    name: "Wine Style",
    graphqlType: "wine_style_enum",
    formatFn: formatWineStyle,
    category: "item",
  },
  wineVariety: {
    name: "Wine Variety",
    graphqlType: "wine_variety_enum",
    formatFn: formatWineVariety,
    category: "item",
  },
  // Beer enums
  beerStyle: {
    name: "Beer Style",
    graphqlType: "beer_style_enum",
    formatFn: formatBeerStyle,
    category: "item",
  },
  // Spirit enums
  spiritType: {
    name: "Spirit Type",
    graphqlType: "spirit_type_enum",
    formatFn: formatSpiritType,
    category: "item",
  },
  // Coffee enums
  coffeeRoastLevel: {
    name: "Coffee Roast Level",
    graphqlType: "coffee_roast_level_enum",
    formatFn: formatEnum,
    category: "item",
  },
  coffeeSpecies: {
    name: "Coffee Species",
    graphqlType: "coffee_species_enum",
    formatFn: formatEnum,
    category: "item",
  },
  coffeeCultivar: {
    name: "Coffee Cultivar",
    graphqlType: "coffee_cultivar_enum",
    formatFn: formatEnum,
    category: "item",
  },
  coffeeProcess: {
    name: "Coffee Process",
    graphqlType: "coffee_process_enum",
    formatFn: formatEnum,
    category: "item",
  },
  // Sake enums
  sakeCategory: {
    name: "Sake Category",
    graphqlType: "sake_category",
    formatFn: formatSakeCategory,
    category: "item",
  },
  sakeType: {
    name: "Sake Type",
    graphqlType: "sake_type",
    formatFn: formatSakeType,
    category: "item",
  },
  sakeServingTemperature: {
    name: "Sake Serving Temperature",
    graphqlType: "sake_serving_temperature",
    formatFn: formatSakeServingTemperature,
    category: "item",
  },
  sakeRiceVariety: {
    name: "Sake Rice Variety",
    graphqlType: "sake_rice_variety",
    formatFn: formatSakeRiceVariety,
    category: "item",
  },
  // Friend request status
  friendRequestStatus: {
    name: "Friend Request Status",
    graphqlType: "friend_request_status_enum",
    formatFn: formatEnum,
    category: "other",
  },
  // Item type
  itemType: {
    name: "Item Type",
    graphqlType: "item_type_enum",
    formatFn: formatEnum,
    category: "item",
  },
} as const satisfies Record<string, EnumConfig>;

export type EnumKey = keyof typeof ENUM_REGISTRY;

export type EnumValue<K extends EnumKey> =
  introspection["types"][(typeof ENUM_REGISTRY)[K]["graphqlType"]] extends {
    enumValues: infer T;
  }
    ? T extends string
      ? T
      : never
    : never;
