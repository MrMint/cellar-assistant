import "server-only";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import type { Draft } from "./needs";
import { NeedsDetailsCellarQuery, NeedsDetailsQuery } from "./queries";

/** The API's page cap: one page holds every draft most people have. */
export const NEEDS_DETAILS_PAGE = 100;

/** `imageUrl` is the server's presigned URL (F-71: one batch, in the page read). */
export type LoadedDraft = Draft & { readonly imageUrl?: string | null };

export type NeedsDetailsLoad = {
  readonly count: number;
  readonly drafts: readonly LoadedDraft[];
  readonly endCursor: string | null;
  readonly cellar: { readonly id: string; readonly name: string } | null;
  readonly failed: boolean;
};

const SESSION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?cellar=` as a cellar id, or null for every cellar. */
export const cellarParam = (value: string | string[] | undefined) => {
  const one = Array.isArray(value) ? value[0] : value;
  return one !== undefined && SESSION_ID.test(one) ? one : null;
};

/**
 * `/needs-details`: the viewer's saved drafts, newest first (one cellar's
 * with `?cellar=`), the count across every kind, and each draft's photo.
 */
export async function loadNeedsDetails(
  cellarId: string | null,
): Promise<NeedsDetailsLoad> {
  const [data, cellarData] = await Promise.all([
    apiServerQuery(NeedsDetailsQuery, {
      cellarId,
      first: NEEDS_DETAILS_PAGE,
    }),
    cellarId === null
      ? Promise.resolve(null)
      : apiServerQuery(NeedsDetailsCellarQuery, { cellarId }),
  ]);
  const cellarResult =
    cellarData === null ? null : unwrapResult(cellarData.cellar, "Cellar");
  const cellar =
    cellarResult?.ok === true
      ? { id: cellarResult.data.id, name: cellarResult.data.name }
      : null;
  const page = unwrapResult(data.needsDetails, "ItemOnboardingConnection");
  if (!page.ok) {
    return { count: 0, drafts: [], endCursor: null, cellar, failed: true };
  }
  const nodes = page.data.edges.map(({ node }) => node);
  return {
    count: data.needsDetailsCount,
    drafts: nodes.map((node) => ({
      id: node.id,
      itemType: node.itemType,
      cellarId: node.cellarId ?? null,
      displayName: node.displayName ?? null,
      displayMaker: node.displayMaker ?? null,
      draftFields: node.draftFields,
      confirmedFields: node.confirmedFields,
      vintageAnswer: node.vintageAnswer,
      imageId: node.imageId ?? null,
      imageUrl: node.imageUrl ?? null,
    })),
    endCursor: page.data.pageInfo.hasNextPage
      ? (page.data.pageInfo.endCursor ?? null)
      : null,
    cellar,
    failed: false,
  };
}
