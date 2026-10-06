"use client";

import { Box, Button, Link, Stack } from "@mui/joy";
import { useMemo } from "react";
import { MdAdd } from "react-icons/md";
import { CellarCardClient } from "@/components/cellar/CellarCardClient";
import { ApiError } from "@/components/cellar-api/ApiError";
import { CELLARS_PAGE_SIZE } from "@/components/cellar-api/pagination";
import { HeaderBar } from "@/components/common/HeaderBar";
import { VirtualGrid } from "@/components/common/VirtualGrid";
import type { FragmentOf } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import { pageOf } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { cellarCardFromFragment } from "./adapter";
import { type CellarCardFragment, GetCellarsQuery } from "./fragments";
import { virtualTotal } from "./virtualTotal";

type CellarEdge = {
  cursor: string;
  node: FragmentOf<typeof CellarCardFragment>;
};

interface CellarsProps {
  cellars: CellarEdge[];
  userId: string;
  /** The server page's `pageInfo` — the grid pages on from here. */
  initialCursor: string | null;
  initialHasNextPage: boolean;
  totalCount: number | null;
}

/**
 * `82450ad1:src/components/cellar/Cellars.tsx`, restored.
 *
 * Same tree — `HeaderBar` ("Home / Cellars", Add cellar), `VirtualGrid`,
 * `CellarCardClient` — over `myCellars`, which is a Relay connection: the
 * server renders the first page, and `VirtualGrid`'s eager load-more walks
 * `pageInfo.endCursor` from there. The old page read every cellar at once.
 *
 * One grid, as the old page had: the rewrite's "Your cellars / Shared with
 * you" split goes (decision 2). `myCellars` is the same superset the old
 * `cellars` query was under Hasura's select permission.
 */
export function Cellars({
  cellars,
  userId,
  initialCursor,
  initialHasNextPage,
  totalCount,
}: CellarsProps) {
  const list = usePagedConnection({
    query: GetCellarsQuery,
    variables: (_args: null, after) => ({ first: CELLARS_PAGE_SIZE, after }),
    select: (data) => pageOf(unwrapResult(data?.myCellars, "CellarConnection")),
    initial: {
      rows: cellars,
      endCursor: initialCursor,
      hasNextPage: initialHasNextPage,
      totalCount,
    },
    initialArgs: null,
  });

  const cellarItems = useMemo(
    () =>
      list.rows.map((edge) => ({
        data: cellarCardFromFragment(edge.node),
      })),
    [list.rows],
  );

  return (
    <Box>
      <Stack spacing={2}>
        <HeaderBar
          serverBreadcrumbs={{}}
          endComponent={
            <Button
              component={Link}
              href={"/cellars/add"}
              startDecorator={<MdAdd />}
            >
              Add cellar
            </Button>
          }
        />
        {list.failure !== null && <ApiError error={list.failure} />}
        <VirtualGrid
          items={cellarItems}
          totalCount={virtualTotal(list)}
          cacheKey="cellars"
          getItemKey={(x) => x.data.id}
          gridBreakpoints={{ xs: 12, sm: 6, md: 4, lg: 3 }}
          estimatedRowHeight={120}
          emptyMessage="No cellars found"
          onLoadMore={async () => {
            await list.loadMore();
          }}
          isLoadingMore={list.status === "loadingMore"}
          renderItem={(x, onBeforeNavigate) => (
            <Box onClick={onBeforeNavigate}>
              <CellarCardClient userId={userId} cellar={x.data} />
            </Box>
          )}
        />
      </Stack>
    </Box>
  );
}
