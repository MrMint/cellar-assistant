"use client";

import { EmptyState } from "@/components/app/EmptyState";
import { Add, Ranked } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { DISCOVER_PAGE_SIZE } from "@/components/cellar-api/pagination";
import {
  CollectionSection,
  type SectionKey,
} from "@/components/common/CollectionSection";
import { HeaderBar } from "@/components/common/HeaderBar";
import { Button } from "@/components/ui/button";
import type { ApiFailure } from "@/lib/api/result";
import { unwrapResult } from "@/lib/api/result";
import { type Page, pageOf } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { GetTierListsQuery, TIER_LISTS_PAGE_SIZE } from "./queries";
import type { TierListCardData } from "./TierListCard";
import { TierListCard } from "./TierListCard";

/** One section's server-rendered first page, or why there is none. */
export type TierListSectionSeed = {
  page: Page<TierListCardData>;
  failure: ApiFailure | null;
};

/** How many cards one page of a section holds. */
export const tierListPageSize = (section: SectionKey): number =>
  section === "DISCOVER" ? DISCOVER_PAGE_SIZE : TIER_LISTS_PAGE_SIZE;

/** Yours, with nothing in it yet (N15). */
function NoTierListsYet() {
  return (
    <EmptyState
      illustration={<Ranked aria-hidden strokeWidth={1.5} />}
      title="Nothing ranked yet."
      description="Rank wines, beers or places, best to worst."
      action={
        <Button asChild>
          <Link href="/tier-lists/add" underline="none">
            <Add aria-hidden />
            New tier list
          </Link>
        </Button>
      }
      className="rounded-lg bg-surface-1"
    />
  );
}

function TierListSectionList({
  section,
  seed,
}: {
  section: SectionKey;
  seed: TierListSectionSeed;
}) {
  const list = usePagedConnection({
    query: GetTierListsQuery,
    variables: (args: SectionKey, after) => ({
      first: tierListPageSize(args),
      after,
      section: args,
    }),
    select: (data) =>
      pageOf(
        unwrapResult(data?.myTierLists, "TierListConnection"),
        (edge) => edge.node,
      ),
    initial: seed.page,
    initialFailure: seed.failure,
    initialArgs: section,
  });

  return (
    <CollectionSection
      section={section}
      rows={list.rows}
      getKey={(tierList) => tierList.id}
      renderItem={(tierList) => <TierListCard tierList={tierList} />}
      totalCount={list.totalCount}
      canLoadMore={list.canLoadMore}
      loadingMore={list.status === "loadingMore"}
      onLoadMore={() => void list.loadMore()}
      failure={list.failure}
      empty={section === "MINE" ? <NoTierListsYet /> : undefined}
    />
  );
}

/**
 * `/tier-lists` — Yours, From friends and Discover (decision D2, X11), each a
 * server-side section of `myTierLists`: yours by when their contents last
 * moved, friends' visible lists, then strangers' PUBLIC ones. A stranger's
 * list never sits among yours. Reached from Me › Lists, where your own are
 * also pinned (D1).
 */
export function TierListsPage({
  sections,
}: {
  sections: Record<SectionKey, TierListSectionSeed>;
}) {
  return (
    <div className="flex flex-col gap-6">
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
      {(["MINE", "FRIENDS", "DISCOVER"] as const).map((section) => (
        <TierListSectionList
          key={section}
          section={section}
          seed={sections[section]}
        />
      ))}
    </div>
  );
}
