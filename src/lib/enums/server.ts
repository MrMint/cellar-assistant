import { unstable_cache } from "next/cache";
import { cache } from "react";
import { GET_ENUM_VALUES } from "@cellar-assistant/shared/enums/provider";
import type { EnumKey, EnumValue } from "@cellar-assistant/shared/enums/registry";
import { ENUM_REGISTRY } from "@cellar-assistant/shared/enums/registry";

export interface EnumOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
}

async function fetchEnumOptionsInternal<K extends EnumKey>(
  enumKey: K,
  serverQueryFn: (
    query: unknown,
    variables?: Record<string, unknown>,
  ) => Promise<{
    __schema: {
      types: Array<{
        name: string;
        enumValues?: Array<{ name: string; description?: string }>;
      }>;
    };
  }>,
): Promise<EnumOption<EnumValue<K>>[]> {
  const config = ENUM_REGISTRY[enumKey];

  try {
    const result = await serverQueryFn(GET_ENUM_VALUES, {});

    if (!result?.__schema?.types) {
      console.error("No schema types found in introspection result");
      throw new Error("No schema types found");
    }

    const enumType = result.__schema.types.find(
      (type) => type.name === config.graphqlType,
    );

    if (!enumType) {
      console.error(
        `Enum type ${config.graphqlType} not found. Available types:`,
        result.__schema.types.map((t) => t.name).slice(0, 10),
      );
      throw new Error(`Enum type ${config.graphqlType} not found`);
    }

    if (!enumType.enumValues) {
      console.error(`Enum type ${config.graphqlType} has no enumValues`);
      throw new Error(`Enum type ${config.graphqlType} has no enum values`);
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

    return options;
  } catch (error) {
    console.error(`Failed to fetch enum ${enumKey} on server:`, error);
    return [];
  }
}

// Standard Next.js cache for request deduplication
export const getEnumOptions = cache(
  async <K extends EnumKey>(
    enumKey: K,
    serverQueryFn: (
      query: unknown,
      variables?: Record<string, unknown>,
    ) => Promise<{
      __schema: {
        types: Array<{
          name: string;
          enumValues?: Array<{ name: string; description?: string }>;
        }>;
      };
    }>,
  ): Promise<EnumOption<EnumValue<K>>[]> => {
    return fetchEnumOptionsInternal(enumKey, serverQueryFn);
  },
);

// Enhanced caching with tags for revalidation control
export const getEnumOptionsWithTags = unstable_cache(
  async <K extends EnumKey>(
    enumKey: K,
    serverQueryFn: (
      query: unknown,
      variables?: Record<string, unknown>,
    ) => Promise<{
      __schema: {
        types: Array<{
          name: string;
          enumValues?: Array<{ name: string; description?: string }>;
        }>;
      };
    }>,
  ): Promise<EnumOption<EnumValue<K>>[]> => {
    return fetchEnumOptionsInternal(enumKey, serverQueryFn);
  },
  ["enum-options"],
  {
    tags: ["enums"],
    revalidate: 3600, // 1 hour cache
  },
);

export async function getMultipleEnumOptions<K extends readonly EnumKey[]>(
  enumKeys: K,
  serverQueryFn: (
    query: unknown,
    variables?: Record<string, unknown>,
  ) => Promise<{
    __schema: {
      types: Array<{
        name: string;
        enumValues?: Array<{ name: string; description?: string }>;
      }>;
    };
  }>,
): Promise<Record<K[number], EnumOption[]>> {
  const results = await Promise.allSettled(
    enumKeys.map(
      async (key) => [key, await getEnumOptions(key, serverQueryFn)] as const,
    ),
  );

  return results.reduce(
    (acc, result, index) => {
      const enumKey = enumKeys[index];
      if (result.status === "fulfilled") {
        (acc as Record<string, EnumOption[]>)[enumKey] = result.value[1];
      } else {
        console.error(`Failed to fetch enum ${enumKey}:`, result.reason);
        (acc as Record<string, EnumOption[]>)[enumKey] = [];
      }
      return acc;
    },
    {} as Record<K[number], EnumOption[]>,
  );
}

// Utility to revalidate enum cache when needed
export async function revalidateEnumCache() {
  const { revalidateTag } = await import("next/cache");
  // Next.js 16 requires a profile argument for cache revalidation
  revalidateTag("enums", "default");
}
