import { Box, Stack, Typography } from "@mui/joy";
import { notFound } from "next/navigation";
import { canAddToCellar, cellarGridItem } from "@/components/cellar/adapter";
import { CellarOverviewHeader } from "@/components/cellar/CellarOverviewHeader";
import { CellarOverviewItems } from "@/components/cellar/CellarOverviewItems";
import {
  CellarInfoFragment,
  GetCellarOverviewQuery,
} from "@/components/cellar/fragments";
import { CellarCheckIns } from "@/components/cellar-api/CellarCheckIns";
import {
  OVERVIEW_ITEMS_PAGE_SIZE,
  OVERVIEW_SORT,
} from "@/components/cellar-api/pagination";
import { ViewerQuery } from "@/lib/api/cellars";
import { readFragment } from "@/lib/api/graphql";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";

/**
 * `/cellars/[cellarId]` — **new-only**, kept under decision 2 and listed for
 * the user to ratify. The old page at this path printed the cellar id, and its
 * breadcrumb sent everyone on to `/items`.
 *
 * Drawn with the restored blocks rather than the rewrite's: `HeaderBar` with
 * the cellar's breadcrumb and the old "Add item" button, an edit icon as on
 * `CellarCard`, a preview of bottles as `ItemCard`s (with "Check in"), and the
 * check-in history (`CellarCheckIns`, which e2e 04 drives).
 */
export const dynamic = "force-dynamic";

const CHECK_INS = 20;

export default async function CellarPage({
  params,
}: {
  params: Promise<{ cellarId: string }>;
}) {
  const { cellarId } = await params;
  const [detail, viewer] = await Promise.all([
    apiServerQuery(GetCellarOverviewQuery, {
      cellarId,
      items: OVERVIEW_ITEMS_PAGE_SIZE,
      checkIns: CHECK_INS,
      sort: OVERVIEW_SORT,
    }),
    apiServerQuery(ViewerQuery, {}),
  ]);

  const result = unwrapResult(detail.cellar, "Cellar");
  if (!result.ok) {
    // §1.6 makes NOT_FOUND cover "not yours to see" as well, on purpose: a
    // cellar id must not be an oracle for whether a cellar exists.
    if (isNotFound(result.error)) notFound();
    return <Typography color="danger">{result.error.message}</Typography>;
  }

  const cellar = readFragment(CellarInfoFragment, result.data);
  const viewerId = viewer.me?.id ?? null;
  const canAdd = canAddToCellar(cellar, viewerId);

  return (
    <Box>
      <Stack spacing={2}>
        <CellarOverviewHeader
          cellarId={cellar.id}
          cellarName={cellar.name}
          activeCount={cellar.itemCounts.total}
          canAdd={canAdd}
        />

        <Typography level="title-lg">Open and recent</Typography>
        <CellarOverviewItems
          cellarId={cellar.id}
          items={result.data.items.edges.map((edge) =>
            cellarGridItem(edge.node),
          )}
          viewerId={viewerId}
        />

        <CellarCheckIns
          cellarId={cellar.id}
          initialEdges={[...result.data.checkIns.edges]}
          initialHasNextPage={result.data.checkIns.pageInfo.hasNextPage}
          totalCount={result.data.checkIns.totalCount ?? null}
          viewerId={viewerId}
        />
      </Stack>
    </Box>
  );
}
