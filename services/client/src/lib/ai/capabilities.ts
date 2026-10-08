/**
 * The client half of `viewer.aiCapabilities` (N07, D25).
 *
 * **Hide only what is known to be unavailable.** Until the answer arrives — or
 * when there is no answer (signed out, a failed request) — a feature stays
 * offered: the server still refuses what it cannot do, with a reason the
 * outcome mapper (`./outcome.ts`) turns into words, so the worst case is the
 * old behaviour, never a feature hidden from a deployment that has it. That
 * also keeps the first paint stable for the common case, where everything is
 * available.
 */
import type { Client } from "urql";
import { useQuery } from "urql";
import { AiCapabilitiesQuery } from "@/lib/api/ai";
import type { ResultOf } from "@/lib/api/graphql";

export type AiCapabilities = NonNullable<
  NonNullable<ResultOf<typeof AiCapabilitiesQuery>["me"]>["aiCapabilities"]
>;

export type AiFeature = Exclude<keyof AiCapabilities, "__typename">;

/** The capabilities out of a query result, or `null` when there are none. */
export const capabilitiesFrom = (
  data: ResultOf<typeof AiCapabilitiesQuery> | undefined | null,
): AiCapabilities | null => data?.me?.aiCapabilities ?? null;

/** Offer `feature` unless the server has said it cannot serve it. */
export const isOffered = (
  capabilities: AiCapabilities | null,
  feature: AiFeature,
): boolean => capabilities === null || capabilities[feature];

/**
 * The capabilities for a component. Cache-first: the answer is process-wide
 * on the server and changes only with a redeploy, so one fetch per session is
 * plenty.
 */
export const useAiCapabilities = (): AiCapabilities | null => {
  const [{ data }] = useQuery({
    query: AiCapabilitiesQuery,
    requestPolicy: "cache-first",
  });
  return capabilitiesFrom(data);
};

/**
 * `isOffered`, for code outside React (an XState actor). Any failure to ask
 * is "offered", for the reason this module's header gives.
 */
export const offeredBy = async (
  client: Client,
  feature: AiFeature,
): Promise<boolean> => {
  try {
    const response = await client
      .query(AiCapabilitiesQuery, {}, { requestPolicy: "cache-first" })
      .toPromise();
    return isOffered(capabilitiesFrom(response.data), feature);
  } catch {
    return true;
  }
};
