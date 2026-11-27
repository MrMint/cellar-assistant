"use client";

import { type ReactNode, useId, useMemo } from "react";
import { EmptyState } from "@/components/app/EmptyState";
import { Add, Cellar } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { ApiError } from "@/components/cellar-api/ApiError";
import { sectionPageSize } from "@/components/cellar-api/pagination";
import {
  SECTION_TITLES,
  type SectionKey,
} from "@/components/common/CollectionSection";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { FragmentOf } from "@/lib/api/graphql";
import type { ApiFailure } from "@/lib/api/result";
import { unwrapResult } from "@/lib/api/result";
import { type Page, pageOf } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { useScrollPositionRestore } from "@/utilities/hooks";
import { CellarSegments } from "./CellarSegments";
import { type CellarIndexCardFragment, GetCellarIndexQuery } from "./fragments";
import { CellarIndexCard } from "./list/CellarIndexCard";
import { type IndexCard, indexCardFromNode } from "./list/index-card";

type CellarEdge = {
  cursor: string;
  node: FragmentOf<typeof CellarIndexCardFragment>;
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

/** A cellar seen on two pages (a page boundary moved) is one card. */
export const uniqueCellarCards = (
  edges: readonly CellarEdge[],
  userId = "",
): IndexCard[] => {
  const seen = new Set<string>();
  return edges.flatMap((edge) => {
    const card = indexCardFromNode(edge.node, userId);
    if (seen.has(card.id)) return [];
    seen.add(card.id);
    return [card];
  });
};

function NewCellarLink({ children }: { children: ReactNode }) {
  return (
    <Link href="/cellars/add" underline="none">
      <Add aria-hidden />
      {children}
    </Link>
  );
}

function NoCellarsYet() {
  return (
    <EmptyState
      illustration={<Cellar aria-hidden strokeWidth={1.5} />}
      title="Your cellar is waiting."
      description="Make one for the bottles you keep — a rack, a fridge, a bar cart."
      action={
        <Button asChild>
          <NewCellarLink>New cellar</NewCellarLink>
        </Button>
      }
      className="rounded-lg bg-card"
    />
  );
}

/**
 * A section of the index (lot-cellars-shelves-01): its title and how many,
 * the cards (one column on a phone, three from md), and "Show more" when
 * there is a next page. An empty section is not drawn, except Yours, which
 * says how to start.
 */
function CellarSectionList({
  section,
  seed,
  userId,
  onBeforeNavigate,
}: {
  section: SectionKey;
  seed: CellarSectionSeed;
  userId: string;
  onBeforeNavigate: () => void;
}) {
  const headingId = useId();
  const list = usePagedConnection({
    query: GetCellarIndexQuery,
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
  const cards = useMemo(
    () => uniqueCellarCards(list.rows, userId),
    [list.rows, userId],
  );
  if (cards.length === 0 && list.failure === null && section !== "MINE") {
    return null;
  }
  const title = SECTION_TITLES[section];
  const count = Math.max(list.totalCount ?? 0, cards.length);
  return (
    <section
      aria-labelledby={headingId}
      data-section={section}
      className="flex flex-col gap-3"
    >
      <div className="flex min-h-11 items-center justify-between gap-2">
        <h2 id={headingId} className="t-head m-0 text-ink">
          {title}
        </h2>
        {count > 0 && <span className="t-cap tabular text-ink-3">{count}</span>}
      </div>
      {list.failure !== null && <ApiError error={list.failure} />}
      {cards.length === 0 ? (
        list.failure === null && <NoCellarsYet />
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <li key={card.id} className="min-w-0">
              <CellarIndexCard
                card={card}
                onBeforeNavigate={onBeforeNavigate}
              />
            </li>
          ))}
        </ul>
      )}
      {list.canLoadMore && (
        <Button
          variant="quiet"
          className="self-center"
          disabled={list.status === "loadingMore"}
          aria-busy={list.status === "loadingMore" || undefined}
          onClick={() => void list.loadMore()}
        >
          {list.status === "loadingMore" && <Spinner aria-hidden />}
          Show more
          <span className="sr-only"> in {title}</span>
        </Button>
      )}
    </section>
  );
}

/**
 * `/cellars` (lot-cellars-shelves-01): "Cellars" with an outlined New cellar,
 * the Cellars · Your bar segment, then Yours, From friends and Discover.
 */
export function Cellars({ userId, sections }: CellarsProps) {
  const { sentinelRef, saveScrollPosition } = useScrollPositionRestore();
  return (
    <div className="flex flex-col gap-6">
      <div ref={sentinelRef} hidden />
      <header className="flex min-h-11 items-center justify-between gap-3">
        <h1 className="t-title m-0 text-ink">Cellars</h1>
        <Button asChild variant="outline">
          <NewCellarLink>New cellar</NewCellarLink>
        </Button>
      </header>
      <CellarSegments current="cellars" />
      {(["MINE", "FRIENDS", "DISCOVER"] as const).map((section) => (
        <CellarSectionList
          key={section}
          section={section}
          seed={sections[section]}
          userId={userId}
          onBeforeNavigate={saveScrollPosition}
        />
      ))}
    </div>
  );
}
