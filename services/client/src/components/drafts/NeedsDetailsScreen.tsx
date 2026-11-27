"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useClient } from "urql";
import { AppBar } from "@/components/app/AppBar";
import { EmptyState, ErrorState } from "@/components/app/EmptyState";
import { FilterChip } from "@/components/app/FilterChip";
import { Add, ChevronRight, Success } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { notify } from "@/components/app/notify";
import { Page } from "@/components/app/Page";
import { TypeGlyph } from "@/components/app/TypeChip";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { unwrapResult } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { DraftThumb } from "./DraftThumb";
import { FinishOneSheet } from "./FinishOneSheet";
import type { LoadedDraft } from "./load";
import {
  bottlesLine,
  confirmInput,
  type Draft,
  type DraftRow,
  type Edits,
  type FinishPlan,
  finishPlan,
  NEED_CHIP,
  type Need,
  needCounts,
  restoreInput,
  rowOf,
} from "./needs";
import {
  ConfirmNeedsDetailsDraftMutation,
  NeedsDetailsQuery,
  SaveNeedsDetailsDraftMutation,
} from "./queries";

type Row = DraftRow & { imageUrl?: string | null };

/** A filed draft waiting out its Undo before it becomes a bottle. */
type Pending = {
  readonly row: Row;
  readonly plan: FinishPlan;
  readonly index: number;
};

const SAVE_TOAST = "needs-details-save";

const rowWith = (draft: Draft, imageUrl?: string | null): Row => ({
  ...rowOf(draft),
  imageUrl,
});

/**
 * `/needs-details` (Capture-Place 25 to 28; CROSS-LOT "Drafts needing
 * details"): every saved draft of every kind, newest first, or one cellar's
 * with `?cellar=`. Chips filter by what is missing; a row opens the
 * finish-one sheet with "n left"; Save moves on to the next bottle with
 * "Saved · Undo". A draft with nothing left is filed as a bottle only when
 * its Undo has run out, so Undo never has to delete one.
 */
export function NeedsDetailsScreen({
  cellar,
  count: initialCount,
  drafts,
  endCursor,
  failed,
}: {
  cellar: { id: string; name: string } | null;
  count: number;
  drafts: readonly LoadedDraft[];
  endCursor: string | null;
  failed: boolean;
}) {
  const client = useClient();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() =>
    drafts.map((draft) => rowWith(draft, draft.imageUrl)),
  );
  const [count, setCount] = useState(initialCount);
  const [filter, setFilter] = useState<Need | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(endCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const pending = useRef(new Map<string, Pending>());

  const visible = useMemo(
    () =>
      filter === null ? rows : rows.filter((row) => row.needs.includes(filter)),
    [rows, filter],
  );
  const chips = useMemo(() => needCounts(rows), [rows]);
  const openRow = rows.find((row) => row.draft.id === openId) ?? null;

  const putBack = useCallback((entry: Pending) => {
    setRows((current) => {
      if (current.some((row) => row.draft.id === entry.row.draft.id)) {
        return current;
      }
      const next = [...current];
      next.splice(Math.min(entry.index, next.length), 0, entry.row);
      return next;
    });
    setCount((n) => n + 1);
  }, []);

  /** File one draft whose Undo ran out. A refusal puts its row back. */
  const confirm = useCallback(
    (id: string) => {
      const entry = pending.current.get(id);
      if (entry === undefined) return;
      pending.current.delete(id);
      void client
        .mutation(ConfirmNeedsDetailsDraftMutation, {
          onboardingId: id,
          input: confirmInput(entry.plan),
        })
        .toPromise()
        .then((result) => {
          const filed = unwrapResult(
            result.data?.confirmItemOnboarding,
            "ConfirmedItemOnboarding",
          );
          if (!filed.ok) {
            putBack(entry);
            notify(`Couldn't add ${entry.row.title}`, { tone: "error" });
          }
        });
    },
    [client, putBack],
  );

  const confirmAll = useCallback(() => {
    for (const id of Array.from(pending.current.keys())) confirm(id);
  }, [confirm]);

  // Leaving the page (or the tab) never loses a filed draft.
  useEffect(() => {
    window.addEventListener("pagehide", confirmAll);
    return () => {
      window.removeEventListener("pagehide", confirmAll);
      confirmAll();
    };
  }, [confirmAll]);

  const save = async (row: Row, edits: Edits) => {
    const plan = finishPlan(row.draft, edits);
    if (plan.needs.length === row.needs.length) {
      feedback("refuse");
      setError("Fill in one field, or Not now.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await client
      .mutation(SaveNeedsDetailsDraftMutation, {
        input: { onboardingId: row.draft.id, ...plan.save },
      })
      .toPromise();
    setSaving(false);
    const saved = unwrapResult(result.data?.saveDraft, "ItemOnboarding");
    if (!saved.ok) {
      feedback("refuse");
      setError(
        saved.error.code === "TRANSPORT"
          ? "Not saved. Offline · changes wait."
          : "Not saved. Try again.",
      );
      return;
    }
    feedback("success");
    // One toast at a time: the last save's Undo ends here, so file it.
    confirmAll();

    const index = rows.findIndex((r) => r.draft.id === row.draft.id);
    const at = visible.findIndex((r) => r.draft.id === row.draft.id);
    const next = visible.slice(at + 1)[0] ?? null;
    const node = saved.data;
    const updated = rowWith(
      {
        id: node.id,
        itemType: node.itemType,
        cellarId: node.cellarId ?? null,
        displayName: node.displayName ?? null,
        displayMaker: node.displayMaker ?? null,
        draftFields: node.draftFields,
        confirmedFields: node.confirmedFields,
        vintageAnswer: node.vintageAnswer,
        imageId: node.imageId ?? null,
      },
      row.imageUrl,
    );

    if (plan.complete) {
      pending.current.set(row.draft.id, { row, plan, index });
      setRows((current) => current.filter((r) => r.draft.id !== row.draft.id));
      setCount((n) => Math.max(0, n - 1));
    } else {
      setRows((current) =>
        current.map((r) => (r.draft.id === row.draft.id ? updated : r)),
      );
    }
    setOpenId(next?.draft.id ?? null);

    const id = row.draft.id;
    notify("Saved", {
      id: SAVE_TOAST,
      undo: () => {
        const entry = pending.current.get(id);
        pending.current.delete(id);
        if (entry !== undefined) putBack(entry);
        else
          setRows((current) =>
            current.map((r) => (r.draft.id === id ? row : r)),
          );
        void client
          .mutation(SaveNeedsDetailsDraftMutation, {
            input: restoreInput(row.draft),
          })
          .toPromise();
      },
      onAutoClose: () => confirm(id),
      onClose: () => confirm(id),
    });
  };

  const loadMore = async () => {
    if (cursor === null) return;
    setLoadingMore(true);
    const result = await client
      .query(NeedsDetailsQuery, {
        cellarId: cellar?.id ?? null,
        first: 100,
        after: cursor,
      })
      .toPromise();
    setLoadingMore(false);
    const page = unwrapResult(
      result.data?.needsDetails,
      "ItemOnboardingConnection",
    );
    if (!page.ok) {
      notify("Couldn't load more", { tone: "error" });
      return;
    }
    const seen = new Set(rows.map((row) => row.draft.id));
    const more = page.data.edges
      .map(({ node }) =>
        rowWith({
          id: node.id,
          itemType: node.itemType,
          cellarId: node.cellarId ?? null,
          displayName: node.displayName ?? null,
          displayMaker: node.displayMaker ?? null,
          draftFields: node.draftFields,
          confirmedFields: node.confirmedFields,
          vintageAnswer: node.vintageAnswer,
          imageId: node.imageId ?? null,
        }),
      )
      .filter((row) => !seen.has(row.draft.id));
    setRows((current) => [...current, ...more]);
    setCursor(
      page.data.pageInfo.hasNextPage
        ? (page.data.pageInfo.endCursor ?? null)
        : null,
    );
  };

  const parent = cellar === null ? "/" : `/cellars/${cellar.id}/items`;
  const subtitle =
    cellar === null
      ? bottlesLine(count)
      : `${bottlesLine(count)} · ${cellar.name}`;

  return (
    <Page data-slot="needs-details">
      <div className="flex flex-col gap-1">
        <AppBar title="Needs details" parent={parent} />
        {!failed && count > 0 && (
          <p className="t-cap tabular m-0 text-ink-2">{subtitle}</p>
        )}
      </div>

      {failed ? (
        <ErrorState
          title="Couldn't load what needs details"
          reason="Check your connection."
          action={
            <Button variant="ghost" onClick={() => router.refresh()}>
              Try again
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          illustration={<Success aria-hidden />}
          title="Nothing needs details"
          action={
            <Button variant="outline" asChild>
              <Link
                href={cellar === null ? "/add" : `/add?cellar=${cellar.id}`}
                underline="none"
              >
                <Add aria-hidden />
                Add a bottle
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div
            role="toolbar"
            aria-label="Filter by what is missing"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
          >
            <FilterChip
              selected={filter === null}
              count={count}
              onClick={() => setFilter(null)}
            >
              All
            </FilterChip>
            {chips.map(({ need, count: n }) => (
              <FilterChip
                key={need}
                selected={filter === need}
                count={n}
                onClick={() => setFilter(filter === need ? null : need)}
              >
                {NEED_CHIP[need]}
              </FilterChip>
            ))}
          </div>

          <ul
            aria-label="Needs details"
            className="m-0 flex list-none flex-col p-0"
          >
            {visible.map((row) => (
              <li
                key={row.draft.id}
                className="border-hair border-b last:border-b-0"
              >
                <button
                  type="button"
                  data-slot="draft-row"
                  onClick={() => {
                    feedback("press");
                    setError(null);
                    setOpenId(row.draft.id);
                  }}
                  className="flex min-h-14 w-full items-center gap-3 py-2 text-left outline-none transition-transform active:scale-97 focus-visible:bg-raised motion-reduce:active:scale-100"
                >
                  <DraftThumb
                    imageId={row.draft.imageId}
                    imageUrl={row.imageUrl}
                    glyph={
                      <TypeGlyph
                        type={row.draft.itemType}
                        className="size-6 text-glyph"
                      />
                    }
                    className="size-[54px] rounded-md"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="t-head truncate text-ink">
                      {row.title}
                    </span>
                    {row.detail !== "" && (
                      <span className="t-cap truncate text-ink-2">
                        {row.detail}
                      </span>
                    )}
                    <span className="t-cap truncate text-ink-2">
                      {row.needLine}
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden
                    className="size-5 shrink-0 text-ink-3"
                  />
                </button>
              </li>
            ))}
          </ul>

          {cursor !== null && (
            <Button
              variant="outline"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className={cn("self-center")}
            >
              {loadingMore ? <Spinner aria-hidden className="size-4" /> : null}
              Show more
            </Button>
          )}
        </>
      )}

      <FinishOneSheet
        row={openRow}
        left={visible.length}
        saving={saving}
        error={error}
        onSave={(row, edits) => void save(row, edits)}
        onOpenChange={(open) => {
          if (!open) {
            setOpenId(null);
            setError(null);
          }
        }}
      />
    </Page>
  );
}
