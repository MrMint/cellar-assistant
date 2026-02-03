import { graphql } from "../gql/graphql";
import type { EnumKey, EnumValue } from "./registry";
import { ENUM_REGISTRY } from "./registry";

export interface EnumOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
}

export const GET_ENUM_VALUES = graphql(`
  query GetEnumValues {
    __schema {
      types {
        name
        enumValues {
          name
          description
        }
      }
    }
  }
`);

const enumCache = new Map<EnumKey, EnumOption[]>();

export async function getEnumOptions<K extends EnumKey>(
  enumKey: K,
  client: {
    query: (
      query: unknown,
      variables: Record<string, unknown>,
    ) => { toPromise: () => Promise<unknown> };
  },
): Promise<EnumOption<EnumValue<K>>[]> {
  if (enumCache.has(enumKey)) {
    const cached = enumCache.get(enumKey);
    if (cached) {
      return cached as EnumOption<EnumValue<K>>[];
    }
  }

  const config = ENUM_REGISTRY[enumKey];

  try {
    const result = (await client.query(GET_ENUM_VALUES, {}).toPromise()) as {
      error?: { message: string };
      data?: {
        __schema: {
          types: Array<{
            name: string;
            enumValues?: Array<{
              name: string;
              description?: string;
            }>;
          }>;
        };
      };
    };

    if (result.error) {
      throw new Error(`Failed to fetch enum values: ${result.error.message}`);
    }

    const enumType = result.data?.__schema.types.find(
      (type) => type.name === config.graphqlType,
    );

    if (!enumType?.enumValues) {
      throw new Error(`Enum type ${config.graphqlType} not found`);
    }

    const options: EnumOption<EnumValue<K>>[] = enumType.enumValues.map(
      (enumValue) => ({
        value: enumValue.name as EnumValue<K>,
        label: config.formatFn
          ? (config.formatFn(enumValue.name) ?? enumValue.name)
          : enumValue.name,
        description: enumValue.description || undefined,
      }),
    );

    enumCache.set(enumKey, options);

    return options;
  } catch (error) {
    console.error(`Failed to fetch enum ${enumKey} on client:`, error);
    return [];
  }
}
