"use client";

import { useMemo } from "react";
import { EmptyState } from "@/components/app/EmptyState";
import { Add, Cellar } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { CellarCardClient } from "@/components/cellar/CellarCardClient";
import {
  CELLARS_PAGE_SIZE,
  DISCOVER_PAGE_SIZE,
} from "@/components/cellar-api/pagination";
import {
  CollectionSection,
  type SectionKey,
} from "@/components/common/CollectionSection";
import { HeaderBar } from "@/components/common/HeaderBar";
import { Button } from "@/components/ui/button";
import type { FragmentOf } from "@/lib/api/graphql";
import type { ApiFailure } from "@/lib/api/result";
import { unwrapResult } from "@/lib/api/result";
import { type Page, pageOf } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { cellarCardFromFragment } from "./adapter";
import { CellarSegments } from "./CellarSegments";
import { type CellarCardFragment, GetCellarsQuery } from "./fragments";

type CellarEdge = {
  cursor: string;
  node: FragmentOf<typeof CellarCardFragment>;
};

/** One section's server-rendered first page, or why there is none. */
export type CellarSectionSeed = {
  page: Page<CellarEdge>;
  failure: ApiFailure | null;
};

interface CellarsProps {
  userId: string;
  sections: Record<SectionKey, CellarSectionSeed>;
}

/** How many cards one page of a section holds. */
export const sectionPageSize = (section: SectionKey): number =>
  section === "DISCOVER" ? DISCOVER_PAGE_SIZE : CELLARS_PAGE_SIZE;

/**
 * `myCellars` is ordered by activity (decision D13), which moves: a cellar
 * whose newest bottle was removed between two page reads can sort below the
 * cursor and come back on the next page. Keep the first sighting so a section
 * never holds one id twice.
 */
export const uniqueCellarCards = (edges: readonly CellarEdge[]) => {
  const seen = new Set<string>();
  return edges.flatMap((edge) => {
    const data = cellarCardFromFragment(edge.node);
    if (seen.has(data.id)) return [];
    seen.add(data.id);
    return [data];
  });
};

/** The first-run state of Yours (N15): no cellar of your own yet. */
function NoCellarsYet() {
  return (
    <EmptyState
      illustration={<Cellar aria-hidden strokeWidth={1.5} />}
      title="Your cellar is waiting."
      description="Make one for the bottles you keep — a rack, a fridge, a bar cart."
      action={
        <Button asChild>
          <Link href="/cellars/add" underline="none">
            <Add aria-hidden />
            New cellar
          </Link>
        </Button>
      }
      className="rounded-lg bg-surface-1"
    />
  );
}

function CellarSectionList({
  section,
  seed,
  userId,
}: {
  section: SectionKey;
  seed: CellarSectionSeed;
  userId: string;
}) {
  const list = usePagedConnection({
    query: GetCellarsQuery,
    variables: (args: SectionKey, after) => ({
      first: sectionPageSize(args),
      after,
      section: args,
    }),
    select: (data) => pageOf(unwrapResult(data?.myCellars, "CellarConnection")),
    initial: seed.page,
    initialFailure: seed.failure,
    initialArgs: section,
  });
  const cards = useMemo(() => uniqueCellarCards(list.rows), [list.rows]);

  return (
    <CollectionSection
      section={section}
      rows={cards}
      getKey={(cellar) => cellar.id}
      renderItem={(cellar) => (
        <CellarCardClient userId={userId} cellar={cellar} />
      )}
      totalCount={list.totalCount}
      canLoadMore={list.canLoadMore}
      loadingMore={list.status === "loadingMore"}
      onLoadMore={() => void list.loadMore()}
      failure={list.failure}
      empty={section === "MINE" ? <NoCellarsYet /> : undefined}
    />
  );
}

/**
 * `/cellars` — the Cellar tab's root, in three sections (decision D2, X11):
 * **Yours** (cellars you created or co-own, by recent activity — D13), **From
 * friends**, and **Discover** (strangers' PUBLIC cellars). Each is its own
 * server-side section of `myCellars`, so a stranger's cellar can never sit
 * among yours, and each pages on its own with "Show more".
 *
 * A brand-new account arrives with "My Cellar" already made (N15); Yours
 * shows the first-run state only when you have no cellar at all. Friends and
 * Discover appear once they have something.
 */
export function Cellars({ userId, sections }: CellarsProps) {
  return (
    <div className="flex flex-col gap-6">
      <HeaderBar
        serverBreadcrumbs={{}}
        endComponent={
          <Button asChild>
            <Link href="/cellars/add" underline="none">
              <Add />
              Add cellar
            </Link>
          </Button>
        }
      />
      <CellarSegments current="cellars" />
      {(["MINE", "FRIENDS", "DISCOVER"] as const).map((section) => (
        <CellarSectionList
          key={section}
          section={section}
          seed={sections[section]}
          userId={userId}
        />
      ))}
    </div>
  );
}
