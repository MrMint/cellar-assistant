"use client";

import type {
  EnumKey,
  EnumOption,
  EnumValue,
} from "@cellar-assistant/shared/enums";
import { getEnumOptions } from "@cellar-assistant/shared/enums";
import { useCallback, useEffect, useState } from "react";
import { useClient } from "urql";
import { useEnumContext } from "@/components/providers/EnumProvider";

export interface UseEnumOptions<K extends EnumKey> {
  initialData?: EnumOption<EnumValue<K>>[];
  enabled?: boolean;
}

export interface UseEnumReturn<K extends EnumKey> {
  options: EnumOption<EnumValue<K>>[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useEnum<K extends EnumKey>(
  enumKey: K,
  options?: UseEnumOptions<K>,
): UseEnumReturn<K> {
  const client = useClient();
  const enumContext = useEnumContext();
  const { initialData, enabled = true } = options || {};

  // PRIORITY 1: Check server data from context
  const serverData = enumContext.getEnumOptions(enumKey) as
    | EnumOption<EnumValue<K>>[]
    | null;
  const hasServerData = enumContext.hasServerData(enumKey);

  // PRIORITY 2: Use provided initial data
  const fallbackData = initialData || [];

  const [enumOptions, setEnumOptions] = useState<EnumOption<EnumValue<K>>[]>(
    serverData || fallbackData,
  );
  const [loading, setLoading] = useState(
    !serverData && !initialData && enabled,
  );
  const [error, setError] = useState<Error | null>(null);

  const fetchOptions = useCallback(
    async (retryCount = 0) => {
      // Only fetch if we don't have server data AND enabled
      if (!enabled || hasServerData) return;

      try {
        setLoading(true);
        setError(null);
        const fetchedOptions = await getEnumOptions(enumKey, {
          query: (query: unknown, variables: Record<string, unknown>) =>
            client.query(query as any, variables || {}),
        });

        // Validate that we got some options
        if (fetchedOptions.length === 0) {
          console.warn(`No enum options returned for ${enumKey}`);
        }

        setEnumOptions(fetchedOptions);
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Unknown error");
        console.error(
          `Failed to fetch enum ${enumKey} (attempt ${retryCount + 1}):`,
          error,
        );

        // Retry logic with exponential backoff (max 2 retries)
        if (retryCount < 2 && error.message.includes("network")) {
          const delay = 2 ** retryCount * 1000; // 1s, 2s, 4s
          setTimeout(() => fetchOptions(retryCount + 1), delay);
          return;
        }

        setError(error);

        // On error, try to use any available fallback data
        if (initialData?.length) {
          console.info(`Using fallback data for enum ${enumKey}`);
          setEnumOptions(initialData);
        }
      } finally {
        setLoading(false);
      }
    },
    [enumKey, client, enabled, hasServerData, initialData],
  );

  useEffect(() => {
    // SERVER-FIRST LOGIC:
    if (hasServerData) {
      // We have server data - use it and don't fetch
      setEnumOptions(serverData!);
      setLoading(false);
      setError(null);
    } else if (initialData?.length) {
      // No server data but we have initial data - use it and don't fetch
      setEnumOptions(initialData);
      setLoading(false);
      setError(null);
    } else if (enabled) {
      // No server data, no initial data - fetch from client (fallback)
      fetchOptions();
    }
  }, [hasServerData, serverData, initialData, enabled, fetchOptions]);

  return {
    options: enumOptions,
    loading,
    error,
    refetch: fetchOptions,
  };
}
