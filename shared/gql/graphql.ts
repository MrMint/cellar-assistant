import { initGraphQLTada } from "gql.tada";
import type { introspection } from "./graphql-env.d.ts";

export enum ItemType {
  Wine = "WINE",
  Beer = "BEER",
  Spirit = "SPIRIT",
  Coffee = "COFFEE",
}

export type WineStyle = ReturnType<typeof graphql.scalar<"wine_style_enum">>;
export type BeerStyle = ReturnType<typeof graphql.scalar<"beer_style_enum">>;
export type SpiritType = ReturnType<typeof graphql.scalar<"spirit_type_enum">>;
export type WineVariety = ReturnType<
  typeof graphql.scalar<"wine_variety_enum">
>;
export type Country = ReturnType<typeof graphql.scalar<"country_enum">>;
export type Permission = ReturnType<
  typeof graphql.scalar<"permission_type_enum">
>;
export type CoffeeRoastLevel = ReturnType<
  typeof graphql.scalar<"coffee_roast_level_enum">
>;
export type CoffeeProcess = ReturnType<
  typeof graphql.scalar<"coffee_process_enum">
>;
export type CoffeeCultivar = ReturnType<
  typeof graphql.scalar<"coffee_cultivar_enum">
>;

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

export type { FragmentOf, ResultOf, VariablesOf } from "gql.tada";
export { readFragment } from "gql.tada";
