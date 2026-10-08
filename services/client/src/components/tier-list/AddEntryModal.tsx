"use client";

import { type FormEvent, useCallback, useState } from "react";
import { useClient } from "urql";
import { Add, Check, ICON_STROKE, Place, Search } from "@/components/app/icons";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { formatScore } from "@/components/app/Score";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { aiOutcome } from "@/lib/ai/outcome";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";
import { createLatestOnly } from "@/lib/latest-only";
import { cn } from "@/lib/utils";
import { displayItemName } from "@/utilities/smart-title-case";
import { isValidListType } from "./actions";
import {
  candidateHref,
  entryTypeOf,
  itemEntrySubtitle,
  placeEntrySubtitle,
} from "./adapter";
import { BAND_LABELS, BAND_TONES, type TierListEntityType } from "./constants";
import { bandForScore } from "./history";
import {
  PICKER_PAGE_SIZE,
  TierListItemPickerQuery,
  TierListPlacePickerQuery,
} from "./queries";

export type AddEntryCandidate = {
  id: string;
  entityType: TierListEntityType;
  name: string;
  subtitle: string;
  /**
   * Your own rating of it (an item review, a place rating), or null — the
   * band it lands in follows from it (`bandForScore`, X23).
   */
  myScore: number | null;
};

const ENTITY_LABELS: Record<TierListEntityType, string> = {
  place: "places",
  wine: "wines",
  beer: "beers",
  spirit: "spirits",
  coffee: "coffees",
  sake: "sake",
  tea: "teas",
};

/**
 * In-page add — **new-only, kept** (decision 2) and restyled in the old
 * `AddToTierListModal`'s idiom (the numbered-list rows, the danger line for
 * errors), on the app's `ResponsiveDialog`: a bottom sheet on a phone, a
 * centred dialog from `md` up.
 *
 * The rewrite's picker offered items *and* places on every list; the old app
 * only ever added an entity to a list of its own type (`list_type`), so this
 * one searches the list's type alone: `placeSearch` for a place list,
 * `itemSearch` narrowed to the one item type otherwise. Both embed the phrase,
 * so the search is a submitted form, not search-as-you-type.
 *
 * The parent remounts it on every open (`key`), so a reopened picker starts
 * empty rather than showing the last query's rows as if they were fresh.
 *
 * X23: the **whole row** is the button (the old row's name did nothing; only
 * a small Add did), each row says where it will land — your rating's band,
 * or Unrated — and what is already on the board reads **On this list**,
 * disabled, instead of offering an add the actor would only refuse.
 */
export function AddEntryModal({
  open,
  onClose,
  onPick,
  busy,
  error,
  listType,
  onList,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (candidate: AddEntryCandidate) => void;
  busy: boolean;
  error: string | null;
  listType: string;
  /** Board hrefs of the entries already on the list (`onListHrefs`). */
  onList: ReadonlySet<string>;
}) {
  const client = useClient();
  const entityType: TierListEntityType = isValidListType(listType)
    ? listType
    : "place";
  const [text, setText] = useState("");
  const [rows, setRows] = useState<AddEntryCandidate[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** A resubmit retires the search before it: only the newest may land. */
  const [searchGate] = useState(createLatestOnly);

  const search = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const phrase = text.trim();
      if (phrase === "") return;
      const isCurrent = searchGate.begin();
      setLoading(true);
      setSearchError(null);

      if (entityType === "place") {
        const response = await client
          .query(TierListPlacePickerQuery, {
            query: phrase,
            first: PICKER_PAGE_SIZE,
          })
          .toPromise();
        if (!isCurrent()) return;
        setLoading(false);
        if (response.error !== undefined) {
          setRows(null);
          setSearchError(failureFromTransport(response.error).message);
          return;
        }
        const result = unwrapResult(
          response.data?.placeSearch,
          "PlaceSearchConnection",
        );
        if (!result.ok) {
          setRows(null);
          // N07: a semantic search refused for an AI reason (no provider, a
          // spent allowance) says so in words, never the server's message.
          setSearchError(
            aiOutcome(result.error, { subject: "search" }).message,
          );
          return;
        }
        setRows(
          result.data.edges.map((edge) => {
            const place = edge.node.place;
            return {
              id: edge.node.id,
              entityType: "place" as const,
              name: place.displayName ?? place.name,
              subtitle: placeEntrySubtitle(place),
              myScore: place.myInteraction?.rating ?? null,
            };
          }),
        );
        return;
      }

      const itemType = entryTypeOf(entityType);
      const response = await client
        .query(TierListItemPickerQuery, {
          text: phrase,
          itemTypes: itemType === "PLACE" ? null : [itemType],
          first: PICKER_PAGE_SIZE,
        })
        .toPromise();
      if (!isCurrent()) return;
      setLoading(false);
      if (response.error !== undefined) {
        setRows(null);
        setSearchError(failureFromTransport(response.error).message);
        return;
      }
      const result = unwrapResult(
        response.data?.itemSearch,
        "ItemSearchConnection",
      );
      if (!result.ok) {
        setRows(null);
        setSearchError(aiOutcome(result.error, { subject: "search" }).message);
        return;
      }
      setRows(
        result.data.edges.map((edge) => ({
          id: edge.node.id,
          entityType,
          name: displayItemName(edge.node.name),
          subtitle: itemEntrySubtitle(edge.node.item),
          myScore: edge.node.item.myReview?.score ?? null,
        })),
      );
    },
    [client, entityType, searchGate, text],
  );

  const message = searchError ?? error;

  const placeholder =
    entityType === "place"
      ? "Search places by name or what they are"
      : `Search ${ENTITY_LABELS[entityType]} by name or description`;
  const SearchGlyph = entityType === "place" ? Place : Search;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Add entry"
      className="md:max-w-[480px]"
    >
      <div className="flex flex-col gap-4 pb-1">
        <form onSubmit={search} className="flex gap-2">
          <InputGroup className="flex-1">
            <InputGroupAddon>
              <SearchGlyph aria-hidden strokeWidth={ICON_STROKE} />
            </InputGroupAddon>
            <InputGroupInput
              autoFocus
              type="search"
              aria-label={placeholder}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={placeholder}
            />
          </InputGroup>
          <Button type="submit" disabled={loading || text.trim() === ""}>
            {loading && <Spinner aria-hidden />}
            Search
          </Button>
        </form>

        {message !== null && (
          <p role="alert" className="text-destructive type-callout">
            {message}
          </p>
        )}

        {loading && rows === null ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : rows === null ? (
          <p className="text-center text-ink-3 type-callout">
            Search for {entityType === "place" ? "a place" : "an item"} to add.
            It lands in the band your rating gives it, or Unrated.
          </p>
        ) : rows.length === 0 ? (
          <p className="text-center text-ink-3 type-callout">
            Nothing matched that phrase.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg bg-surface-1 md:max-h-[60vh] md:overflow-y-auto">
            {rows.map((row) => (
              <li key={`${row.entityType}-${row.id}`}>
                <CandidateRow
                  row={row}
                  onList={onList.has(candidateHref(row))}
                  busy={busy}
                  onPick={onPick}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </ResponsiveDialog>
  );
}

/**
 * One search result, the whole row a button: name and description, then
 * where it would land — "You 4 · Very Good" — or, already on the board,
 * "On this list" and nothing to press.
 */
export function CandidateRow({
  row,
  onList,
  busy,
  onPick,
}: {
  row: AddEntryCandidate;
  onList: boolean;
  busy: boolean;
  onPick: (candidate: AddEntryCandidate) => void;
}) {
  const band = bandForScore(row.myScore);
  const tone = BAND_TONES[band] ?? BAND_TONES[0];
  return (
    <button
      type="button"
      data-slot="add-entry-candidate"
      disabled={onList || busy}
      aria-disabled={onList || busy}
      onClick={() => onPick(row)}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors duration-(--ca-dur-micro) ease-standard focus-visible:ring-[3px] focus-visible:ring-ring/50 enabled:hover:bg-surface-2 enabled:active:bg-surface-3",
        busy && !onList && "opacity-60",
      )}
    >
      <span className="flex size-5 shrink-0 items-center justify-center text-ink-2">
        {onList ? (
          <Check
            aria-hidden
            strokeWidth={ICON_STROKE}
            className="size-5 text-success"
          />
        ) : (
          <Add aria-hidden strokeWidth={ICON_STROKE} className="size-5" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold text-ink-1 type-callout">
          {!onList && <span className="sr-only">Add </span>}
          {row.name}
        </span>
        {row.subtitle !== "" && (
          <span className="truncate type-footnote">{row.subtitle}</span>
        )}
      </span>
      {onList ? (
        <span className="shrink-0 text-success type-footnote">
          On this list
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1.5 text-ink-2 type-footnote">
          {row.myScore !== null && (
            <span className="tabular">You {formatScore(row.myScore)} ·</span>
          )}
          <span
            aria-hidden
            className={cn("size-2 shrink-0 rounded-full", tone.swatch)}
          />
          <span>{BAND_LABELS[band]}</span>
        </span>
      )}
    </button>
  );
}
