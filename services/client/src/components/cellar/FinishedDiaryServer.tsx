import { ApiError } from "@/components/cellar-api/ApiError";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { diaryEntry } from "./adapter";
import { CellarSearchSummary } from "./CellarSearchSummary";
import { cellarDiaryVariables } from "./cellarItemsQuery";
import { FinishedDiary } from "./FinishedDiary";
import { GetCellarDiaryQuery } from "./fragments";

/**
 * The Finished diary's first page, on the server (X04), streamed under the
 * page's Suspense like the grid. `FinishedDiary` pages on with the same
 * variables.
 */
export async function FinishedDiaryServer({
  cellarId,
  search,
  types,
  timeZone,
  canAdd,
}: {
  cellarId: string;
  search: string;
  types: ApiItemType[];
  timeZone: string;
  canAdd: boolean;
}) {
  const data = await apiServerQuery(
    GetCellarDiaryQuery,
    cellarDiaryVariables(cellarId, { search, types }, null),
  );
  const result = unwrapResult(data.cellar, "Cellar");
  if (!result.ok) return <ApiError error={result.error} />;
  const { itemGroups } = result.data;
  return (
    <>
      {search.trim() !== "" && (
        <CellarSearchSummary
          search={search.trim()}
          bottleCount={itemGroups.totalCount ?? itemGroups.edges.length}
          meaning={itemGroups.meaning}
        />
      )}
      <FinishedDiary
        cellarId={cellarId}
        search={search}
        types={types}
        timeZone={timeZone}
        canAdd={canAdd}
        initialEntries={itemGroups.edges.map((edge) => diaryEntry(edge.node))}
        initialCursor={itemGroups.pageInfo.endCursor ?? null}
        initialHasNextPage={itemGroups.pageInfo.hasNextPage}
        totalCount={itemGroups.totalCount ?? null}
      />
    </>
  );
}
