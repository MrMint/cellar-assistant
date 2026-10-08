"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useClient } from "urql";
import { ListRow } from "@/components/app/Page";
import { Timestamp } from "@/components/common/Timestamp";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CellarDetailQuery, CheckInRowFragment } from "@/lib/api/cellars";
import type { FragmentOf } from "@/lib/api/graphql";
import { readFragment } from "@/lib/api/graphql";
import {
  type ApiFailure,
  failureFromTransport,
  unwrapResult,
} from "@/lib/api/result";
import { createLatestOnly, runLatest } from "@/lib/latest-only";
import { ApiError } from "./ApiError";
import { UserName } from "./UserName";

export const CHECK_INS_PAGE_SIZE = 20;

export type CheckInEdge = {
  cursor: string;
  node: FragmentOf<typeof CheckInRowFragment>;
};

/**
 * Everything drunk out of this cellar.
 *
 * **Gated on `canSeeCellar`, not on friendship (B1).** If you can see the
 * cellar you see every check-in in it, including a co-owner's, friend or not —
 * because the cellar is the shared thing, and hiding half its history from
 * someone standing in front of it makes the page lie. The *item* page answers a
 * different question ("who I know has drunk this, anywhere") and uses the
 * looser author-or-friend rule there. The two lists are not interchangeable and
 * must not be merged.
 */
export function CellarCheckIns({
  cellarId,
  initialEdges,
  initialHasNextPage,
  totalCount,
  viewerId,
}: {
  cellarId: string;
  initialEdges: CheckInEdge[];
  initialHasNextPage: boolean;
  totalCount: number | null;
  viewerId: string | null;
}) {
  const client = useClient();
  const [edges, setEdges] = useState(initialEdges);
  const [hasNextPage, setHasNextPage] = useState(initialHasNextPage);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [shown, setShown] = useState(CHECK_INS_PAGE_SIZE);
  /**
   * Each "more" replaces the whole list with a bigger window, so an older,
   * smaller answer landing after a newer one would shrink it again — and a new
   * server page (`router.refresh()`) must retire any "more" still in flight.
   */
  const [windowGate] = useState(createLatestOnly);
  const headingId = useId();

  useEffect(() => {
    windowGate.invalidate();
    setLoading(false);
    setEdges(initialEdges);
    setHasNextPage(initialHasNextPage);
    setShown(CHECK_INS_PAGE_SIZE);
  }, [initialEdges, initialHasNextPage, windowGate]);

  /**
   * `Cellar.checkIns` is a connection on the cellar, and `CellarDetailQuery` is
   * the only document that reaches it — so "more" re-reads the cellar with a
   * bigger `checkIns` window rather than paging with `after`. That costs one
   * extra activation of an actor that is already warm and keeps a single
   * document for the page; a dedicated `cellarCheckIns` root field would be the
   * alternative, and only C3 may add one.
   */
  const loadMore = useCallback(async () => {
    const next = shown + CHECK_INS_PAGE_SIZE;
    setLoading(true);
    setError(null);
    await runLatest(
      windowGate,
      () =>
        client
          .query(CellarDetailQuery, {
            cellarId,
            items: 1,
            checkIns: next,
            sort: null,
          })
          .toPromise(),
      (response) => {
        setLoading(false);
        if (response.error !== undefined) {
          setError(failureFromTransport(response.error));
          return;
        }
        const cellar = unwrapResult(response.data?.cellar, "Cellar");
        if (!cellar.ok) {
          setError(cellar.error);
          return;
        }
        setEdges([...cellar.data.checkIns.edges]);
        setHasNextPage(cellar.data.checkIns.pageInfo.hasNextPage);
        setShown(next);
      },
    );
  }, [client, cellarId, shown, windowGate]);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h2 id={headingId} className="type-headline">
          Check-ins
        </h2>
        {totalCount !== null && (
          <span className="type-callout tabular text-ink-3">{totalCount}</span>
        )}
      </div>

      {error !== null && <ApiError error={error} />}

      {edges.length === 0 ? (
        <p className="type-callout text-ink-3">
          Nobody has drunk anything out of this cellar yet.
        </p>
      ) : (
        <ul
          aria-labelledby={headingId}
          className="flex flex-col divide-y divide-line overflow-hidden rounded-lg bg-surface-1"
        >
          {edges.map((edge) => {
            const checkIn = readFragment(CheckInRowFragment, edge.node);
            return (
              <li key={checkIn.id}>
                <ListRow
                  title={
                    <UserName userId={checkIn.userId} viewerId={viewerId} />
                  }
                  trailing={
                    <span className="type-footnote">
                      <Timestamp iso={checkIn.createdAt} />
                    </span>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}

      {hasNextPage && (
        <Button
          variant="ghost"
          className="self-center"
          disabled={loading}
          aria-busy={loading || undefined}
          onClick={() => void loadMore()}
        >
          {loading && <Spinner aria-hidden />}
          Show more
        </Button>
      )}
    </section>
  );
}
