"use client";

/**
 * Add to a list (Social-Lists 32, add-drink-01..03; CROSS-LOT "Add to a
 * list"): the thing's name, the band it lands in ("Outstanding · from your
 * stars"), your own lists of its kind ("My beers · 100 beers", with its rank
 * chip and a check where it already is), "New beer list" (a name, then
 * Create and add) and All lists. Tapping a list adds at once; the toast says
 * where it went ("Added to Outstanding · #13 · Duchesse…") with Undo, one
 * step of that list's history (D4).
 *
 * No Unrated band (Social-Lists ruling 2): something you have not rated
 * asks for a band first, in the same sheet, rather than landing unranked.
 *
 * Only your own lists are offered (`tierListOptionsFor` keeps the owner
 * check as a second line behind `myTierLists(section: MINE)`), so a list you
 * do not own is never a target. The props are unchanged: C2's `ItemMenu` and
 * `AddToListButton`, and the places' `PlaceDetailsContent` and
 * `MenuLineList`, open it.
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useClient, useQuery } from "urql";
import {
  Add,
  Check,
  ChevronRight,
  ICON_STROKE,
  Lists,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { notify } from "@/components/app/notify";
import {
  BANDS,
  type Band,
  BandMarker,
  bandName,
  RankChip,
} from "@/components/app/parts/Rank";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { unwrapResult } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { useTierListActions } from "./actions";
import { entryTypeOf, tierListOptionsFor } from "./adapter";
import type { TierListEntityType } from "./constants";
import { bandForScore } from "./history";
import { kindNoun, kindOne, rankOf } from "./lists/model";
import { ListRanksQuery } from "./lists/queries";
import {
  ENTITY_ENTRIES_PAGE_SIZE,
  GetTierListsForItemQuery,
  GetTierListsForPlaceQuery,
  TIER_LISTS_PAGE_SIZE,
} from "./queries";
import { defaultListName } from "./TierListForm";
import { useAllMyTierLists } from "./useAllMyTierLists";

interface AddToTierListModalProps {
  open: boolean;
  onClose: () => void;
  entityId: string;
  entityType: TierListEntityType;
  entityName: string;
  /** The old query's `$userId`; unused — the API knows the viewer. */
  userId?: string;
}

const asBand = (band: number): Band | null =>
  band >= 1 && band <= 5 ? (band as Band) : null;

/** An entry's rank on one list, read from that list (`ListRanksQuery`). */
function EntryRank({
  tierListId,
  entryId,
  band,
}: {
  tierListId: string;
  entryId: string;
  band: number;
}) {
  const [{ data }] = useQuery({
    query: ListRanksQuery,
    variables: { id: tierListId },
    requestPolicy: "network-only",
  });
  const list = unwrapResult(data?.tierList, "TierList");
  const rank = list.ok
    ? rankOf(
        list.data.items.edges.map((edge) => edge.node),
        entryId,
      )
    : null;
  const chipBand = asBand(band);
  if (rank === null || chipBand === null) return null;
  return <RankChip rank={rank} band={chipBand} />;
}

const ROW =
  "relative flex min-h-14 w-full items-center gap-4 rounded-md px-1 text-left outline-none transition-transform duration-(--ca-dur-micro) ease-standard focus-visible:outline-2 focus-visible:outline-act-ink focus-visible:outline-offset-2 active:scale-97 disabled:opacity-40 motion-reduce:active:scale-100 [@media(hover:hover)]:enabled:hover:bg-raised";

export function AddToTierListModal({
  open,
  onClose,
  entityId,
  entityType,
  entityName,
}: AddToTierListModalProps) {
  const router = useRouter();
  const client = useClient();
  const { addItemToTierListAction, addTierListAction, undoAction } =
    useTierListActions();
  const isPlace = entityType === "place";
  const itemType = entryTypeOf(entityType);

  // network-only: an add elsewhere must show on reopen.
  const [{ data: itemData, fetching: itemFetching }] = useQuery({
    query: GetTierListsForItemQuery,
    variables: {
      itemId: entityId,
      itemType: itemType === "PLACE" ? "WINE" : itemType,
      first: ENTITY_ENTRIES_PAGE_SIZE,
    },
    pause: !open || isPlace,
    requestPolicy: "network-only",
  });
  const [{ data: placeData, fetching: placeFetching }] = useQuery({
    query: GetTierListsForPlaceQuery,
    variables: { placeId: entityId, first: TIER_LISTS_PAGE_SIZE },
    pause: !open || !isPlace,
    requestPolicy: "network-only",
  });
  // network-only for the same reason: a list created elsewhere must show.
  const {
    lists,
    viewerId,
    loading: listsLoading,
  } = useAllMyTierLists({ active: open, fresh: true });
  const fetching = (isPlace ? placeFetching : itemFetching) || listsLoading;
  const entity = isPlace
    ? (() => {
        const place = unwrapResult(placeData?.place, "Place");
        return place.ok
          ? {
              entries: place.data.tierListEntries.edges,
              myScore: place.data.myInteraction?.rating ?? null,
            }
          : { entries: [], myScore: null };
      })()
    : (() => {
        const item = unwrapResult(itemData?.item, "QueryItemSuccess");
        return item.ok
          ? {
              entries: item.data.data.tierListEntries.edges,
              myScore: item.data.data.myReview?.score ?? null,
            }
          : { entries: [], myScore: null };
      })();
  const entries = entity.entries.map((edge) => edge.node);
  /** X23: your verdict's band; null when you have not rated it. */
  const ratedBand = asBand(bandForScore(entity.myScore));
  const [pickedBand, setPickedBand] = useState<Band | null>(null);
  const band = ratedBand ?? pickedBand;

  const [addingToListId, setAddingToListId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creating, setCreating] = useState(false);

  const options = tierListOptionsFor(lists, entries, viewerId, entityType);
  const counts = new Map(lists.map((list) => [list.id, list.itemCount]));
  const busy = addingToListId != null || creating;

  // A fresh sheet each time it opens.
  useEffect(() => {
    if (!open) return;
    setShowCreate(false);
    setPickedBand(null);
    setNewListName(defaultListName(entityType));
  }, [open, entityType]);

  /** Where it landed, as the toast says it: "#13", or nothing if unread. */
  const rankAfterAdd = useCallback(
    async (tierListId: string, entryId: string | undefined) => {
      if (entryId === undefined) return null;
      const read = await client
        .query(
          ListRanksQuery,
          { id: tierListId },
          { requestPolicy: "network-only" },
        )
        .toPromise();
      const list = unwrapResult(read.data?.tierList, "TierList");
      return list.ok
        ? rankOf(
            list.data.items.edges.map((edge) => edge.node),
            entryId,
          )
        : null;
    },
    [client],
  );

  /**
   * The add's toast: band, rank and name, and an Undo that takes back
   * exactly that add (`editSeq`) — or no Undo when the add's edit could not
   * be named, rather than one that might take back a newer edit.
   */
  const added = useCallback(
    (
      tierListId: string,
      listName: string,
      landed: Band,
      rank: number | null,
      editSeq: number | null,
    ) => {
      feedback("success");
      const message = [
        `Added to ${bandName(landed)}`,
        rank === null ? null : `#${rank}`,
        entityName,
      ]
        .filter((part) => part !== null)
        .join(" · ");
      if (editSeq === null) {
        notify(message);
        return;
      }
      notify(message, {
        undo: () => {
          void undoAction(tierListId, editSeq).then((result) => {
            if (result.success) {
              notify(`Off ${listName}`);
              router.refresh();
            } else {
              fail(
                result.moved === true
                  ? `${listName} changed elsewhere · nothing undone`
                  : result.error,
              );
            }
          });
        },
      });
    },
    [entityName, router, undoAction],
  );

  const handleAddToList = useCallback(
    async (tierListId: string, listName: string) => {
      if (band === null) return;
      setAddingToListId(tierListId);
      try {
        const result = await addItemToTierListAction(
          tierListId,
          entityId,
          entityType,
          band,
        );
        if (result.success) {
          const rank = await rankAfterAdd(tierListId, result.tierListItemId);
          router.refresh();
          onClose();
          added(tierListId, listName, band, rank, result.editSeq ?? null);
        } else {
          fail(result.error ?? "Couldn’t add it · try again");
        }
      } finally {
        setAddingToListId(null);
      }
    },
    [
      band,
      entityId,
      entityType,
      onClose,
      router,
      addItemToTierListAction,
      added,
      rankAfterAdd,
    ],
  );

  const handleCreateAndAdd = useCallback(async () => {
    if (band === null) return;
    const name = newListName.trim();
    if (name.length === 0) {
      feedback("refuse");
      return;
    }
    setCreating(true);
    try {
      const created = await addTierListAction(
        name,
        undefined,
        "PRIVATE",
        entityType,
      );
      if (!created.success || !created.tierListId) {
        fail(created.error ?? "Couldn’t make the list · try again");
        return;
      }
      const result = await addItemToTierListAction(
        created.tierListId,
        entityId,
        entityType,
        band,
      );
      if (result.success) {
        router.refresh();
        onClose();
        // The only entry on a new list is #1.
        added(created.tierListId, name, band, 1, result.editSeq ?? null);
      } else {
        fail(result.error ?? "Couldn’t add it · try again");
      }
    } finally {
      setCreating(false);
    }
  }, [
    band,
    newListName,
    entityId,
    entityType,
    onClose,
    router,
    addItemToTierListAction,
    addTierListAction,
    added,
  ]);

  const kind = kindOne(entityType);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Add to a list"
      description={entityName}
      className="md:max-w-[440px]"
    >
      <div data-slot="add-to-list" className="flex flex-col gap-2 pb-1">
        {fetching ? (
          <div className="flex justify-center py-6">
            <Spinner aria-hidden />
            <span className="sr-only">Loading your lists</span>
          </div>
        ) : (
          <>
            {ratedBand !== null ? (
              <p className="t-body m-0 flex min-h-11 items-center gap-3 text-ink-2">
                <BandMarker band={ratedBand} />
                {bandName(ratedBand)} · from your {isPlace ? "rating" : "stars"}
              </p>
            ) : (
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0 pb-2">
                <legend className="t-body mb-2 p-0 text-ink-2">
                  Not rated yet · pick a band
                </legend>
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                  {BANDS.map(({ band: value, name }) => {
                    const on = pickedBand === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          feedback("tick");
                          setPickedBand(value);
                        }}
                        className={cn(
                          "t-head inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border px-3.5 outline-none transition-transform duration-(--ca-dur-micro) ease-standard focus-visible:outline-2 focus-visible:outline-act-ink focus-visible:outline-offset-2 active:scale-97 motion-reduce:active:scale-100",
                          on
                            ? "border-edge-2 bg-sel text-ink"
                            : "border-edge text-ink-2",
                        )}
                      >
                        <BandMarker band={value} />
                        {name}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {options.length > 0 && (
              <ul className="m-0 flex list-none flex-col p-0">
                {options.map((option) => {
                  const entry = entries.find(
                    (node) => node.tierListId === option.id,
                  );
                  const count = counts.get(option.id) ?? 0;
                  const isAdding = addingToListId === option.id;
                  const body = (
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="t-body truncate text-ink">
                        {option.name}
                      </span>
                      <span className="t-cap tabular text-ink-2">
                        {kindNoun(entityType, count)}
                      </span>
                    </span>
                  );
                  if (entry !== undefined) {
                    return (
                      <li
                        key={option.id}
                        className="flex min-h-14 items-center gap-4 px-1"
                      >
                        {body}
                        <EntryRank
                          tierListId={option.id}
                          entryId={entry.id}
                          band={entry.band}
                        />
                        <Check
                          strokeWidth={ICON_STROKE}
                          className="size-5 shrink-0 text-act-ink"
                          aria-label="On this list"
                        />
                      </li>
                    );
                  }
                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        disabled={busy || band === null}
                        aria-busy={isAdding || undefined}
                        onClick={() => {
                          feedback("tick");
                          void handleAddToList(option.id, option.name);
                        }}
                        className={ROW}
                      >
                        {body}
                        {isAdding ? (
                          <Spinner aria-hidden />
                        ) : (
                          <Add
                            aria-hidden
                            strokeWidth={ICON_STROKE}
                            className="size-5 shrink-0 text-act-ink"
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {showCreate ? (
              <form
                className="flex flex-col gap-3 pt-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!busy) void handleCreateAndAdd();
                }}
              >
                <label
                  htmlFor="add-to-list-new-name"
                  className="t-head text-ink"
                >
                  New {kind} list
                </label>
                <Input
                  id="add-to-list-new-name"
                  autoFocus
                  autoComplete="off"
                  value={newListName}
                  onChange={(event) => setNewListName(event.target.value)}
                  disabled={busy}
                />
                <Button
                  type="submit"
                  className="h-11 w-full"
                  disabled={busy || band === null}
                >
                  {creating && <Spinner aria-hidden />}
                  Create and add
                </Button>
              </form>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  feedback("tick");
                  setShowCreate(true);
                }}
                className={ROW}
              >
                <Add
                  aria-hidden
                  strokeWidth={ICON_STROKE}
                  className="size-5 shrink-0 text-act-ink"
                />
                <span className="t-body text-ink">New {kind} list</span>
              </button>
            )}

            <div className="mt-2 border-edge border-t pt-2">
              <Link
                href="/tier-lists"
                underline="none"
                onClick={() => {
                  feedback("tick");
                  onClose();
                }}
                className={cn(ROW, "text-ink")}
              >
                <Lists
                  aria-hidden
                  strokeWidth={ICON_STROKE}
                  className="size-5 shrink-0 text-act-ink"
                />
                <span className="t-body flex-1">All lists</span>
                <ChevronRight
                  aria-hidden
                  strokeWidth={ICON_STROKE}
                  className="size-5 shrink-0 text-ink-3"
                />
              </Link>
            </div>
          </>
        )}
      </div>
    </ResponsiveDialog>
  );
}

/** A failure, said as a toast. */
function fail(message: string) {
  notify(message, { tone: "error" });
}
