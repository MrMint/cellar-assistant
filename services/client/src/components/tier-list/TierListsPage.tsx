"use client";

import { useMemo } from "react";
import { Add } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { virtualTotal } from "@/components/cellar/virtualTotal";
import { ApiError } from "@/components/cellar-api/ApiError";
import { HeaderBar } from "@/components/common/HeaderBar";
import { VirtualGrid } from "@/components/common/VirtualGrid";
import { Button } from "@/components/ui/button";
import { unwrapResult } from "@/lib/api/result";
import { type Page, pageOf } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { GetTierListsQuery, TIER_LISTS_PAGE_SIZE } from "./queries";
import type { TierListCardData } from "./TierListCard";
import { TierListCard } from "./TierListCard";

interface TierListsPageProps {
  initialPage: Page<TierListCardData>;
}

/**
 * `82450ad1:src/components/tier-list/TierListsPage.tsx`, restored: the
 * `HeaderBar` with "New tier list", a `VirtualGrid` of `TierListCard`s.
 *
 * The old page held every visible list from one unpaged query; `myTierLists`
 * is a cursor connection (100 a page), so the server's first page seeds the
 * grid and `VirtualGrid`'s eager load-more walks the rest.
 */
export function TierListsPage({ initialPage }: TierListsPageProps) {
  const list = usePagedConnection({
    query: GetTierListsQuery,
    variables: (_args: null, after) => ({ first: TIER_LISTS_PAGE_SIZE, after }),
    select: (data) =>
      pageOf(
        unwrapResult(data?.myTierLists, "TierListConnection"),
        (edge) => edge.node,
      ),
    initial: initialPage,
    initialArgs: null,
  });
  const tierListItems = useMemo(() => [...list.rows], [list.rows]);

  return (
    <div className="flex flex-col gap-4">
      <HeaderBar
        serverBreadcrumbs={{}}
        endComponent={
          <Button asChild>
            <Link
              href="/tier-lists/add"
              underline="none"
              className="rounded-md"
            >
              <Add />
              New tier list
            </Link>
          </Button>
        }
      />
      {list.failure !== null && (
        <ApiError error={list.failure} title="Could not load tier lists" />
      )}
      <VirtualGrid
        items={tierListItems}
        totalCount={virtualTotal(list)}
        cacheKey="tier-lists"
        getItemKey={(data) => data.id}
        gridBreakpoints={{ xs: 12, sm: 6, md: 4, lg: 3 }}
        emptyMessage="No tier lists found"
        onLoadMore={async () => {
          await list.loadMore();
        }}
        isLoadingMore={list.status === "loadingMore"}
        renderItem={(data, onBeforeNavigate) => (
          <TierListCard tierList={data} onNavigate={onBeforeNavigate} />
        )}
      />
    </div>
  );
}
