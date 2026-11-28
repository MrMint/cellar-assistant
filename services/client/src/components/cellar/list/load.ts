import type { ResultOf } from "@/lib/api/graphql";
import { type ApiFailure, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { CELLAR_STATUSES, type CellarStatus } from "../cellarItemsQuery";
import { CellarNeedsDetailsCountQuery, GetCellarListQuery } from "../fragments";
import type { ListBottle } from "./model";
import { listBottleFromNode } from "./read";

/** The API's page cap (`first`: 1 to 100). */
const PAGE = 100;

export type WholeCellar =
  | {
      ok: true;
      bottles: ListBottle[];
      /** Bottles (×N counted), not tiles: the header's "240 bottles". */
      bottleCount: number;
      /** Always false: the read has no cap now (F-145); kept for callers. */
      capped: false;
    }
  | { ok: false; error: ApiFailure };

/**
 * Every tile of a cellar (or of a search in it), page after page. The
 * arrangements need the whole list (`model.ts`); a cellar is a few hundred
 * bottles, so this is a handful of reads.
 */
export async function loadWholeCellar(
  cellarId: string,
  args: { search: string; status: CellarStatus },
): Promise<WholeCellar> {
  const search = args.search.trim();
  const status =
    CELLAR_STATUSES.find((entry) => entry.value === args.status)?.api ??
    "ACTIVE";
  const bottles: ListBottle[] = [];
  let after: string | null = null;
  let bottleCount = 0;
  for (;;) {
    const data: ResultOf<typeof GetCellarListQuery> = await apiServerQuery(
      GetCellarListQuery,
      {
        cellarId,
        first: PAGE,
        after,
        status,
        search: search === "" ? null : search,
      },
    );
    const result = unwrapResult(data.cellar, "Cellar");
    if (!result.ok) return { ok: false, error: result.error };
    const groups = result.data.itemGroups;
    bottleCount = groups.bottleCount ?? bottleCount;
    for (const edge of groups.edges) {
      bottles.push(listBottleFromNode(cellarId, edge.node));
    }
    if (!groups.pageInfo.hasNextPage || groups.pageInfo.endCursor === null) {
      return { ok: true, bottles, bottleCount, capped: false };
    }
    after = groups.pageInfo.endCursor;
  }
}

/** MC-drafts: the cellar's Needs-details count; 0 when it cannot be read. */
export async function loadNeedsDetailsCount(cellarId: string): Promise<number> {
  try {
    const data = await apiServerQuery(CellarNeedsDetailsCountQuery, {
      cellarId,
    });
    return data.needsDetailsCount ?? 0;
  } catch {
    return 0;
  }
}
