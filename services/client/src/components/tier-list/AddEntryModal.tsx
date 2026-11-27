"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useId,
  useMemo,
  useState,
} from "react";
import { useClient, useQuery } from "urql";
import {
  Check,
  Close,
  ICON_STROKE,
  Place,
  Search,
} from "@/components/app/icons";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { formatScore } from "@/components/app/Score";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { aiOutcome } from "@/lib/ai/outcome";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
import { createLatestOnly } from "@/lib/latest-only";
import { cn } from "@/lib/utils";
import { displayItemName } from "@/utilities/smart-title-case";
import { isValidListType } from "./actions";
import { entryTypeOf, itemEntrySubtitle, placeEntrySubtitle } from "./adapter";
import {
  type AddEntryCandidate,
  type AddEntrySection,
  addButtonLabel,
  candidateKey,
  type Picks,
  SECTION_PREVIEW,
  type SuggestionNode,
  sectionTitle,
  suggestionSections,
  togglePick,
} from "./add-entry";
import {
  BAND_LABELS,
  BAND_TONES,
  entryNoun,
  type TierListEntityType,
} from "./constants";
import { bandForScore } from "./history";
import { PairwisePlacement } from "./pairwise/PairwisePlacement";
import {
  PICKER_PAGE_SIZE,
  SUGGESTIONS_PAGE_SIZE,
  TierListAddSuggestionsQuery,
  TierListItemPickerQuery,
  TierListPlacePickerQuery,
} from "./queries";

export type { AddEntryCandidate } from "./add-entry";

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
 * Add entry — **without typing** (X16). The sheet opens on what you already
 * know: **In your cellars**, **Tasted, not ranked** (your ratings and drink
 * logs; for a place list, where you've been) and **Friends ranked** — every
 * row saying why it is there and the band it will land in. Tap as many as
 * you like, then **Add N entries**: one multi-add, one edit in the list's
 * history, so the toast's Undo takes them all back.
 *
 * Search stays at the top for anything else: `placeSearch` for a place list,
 * `itemSearch` narrowed to the list's type otherwise. Both embed the phrase,
 * so it is a submitted form, not search-as-you-type. A search's rows are
 * pickable the same way, and picks made in the sections survive a search.
 *
 * Kept from X23: the **whole row** is the control, each row says where it
 * will land — your rating's band, or Unrated — and what is already on the
 * board reads **On this list**, disabled. The parent remounts the sheet on
 * every open (`key`), so a reopened one starts with nothing picked and no
 * stale search.
 *
 * L09: with exactly one pick, **Compare to place it** turns the sheet into
 * the pairwise questions (`pairwise/PairwisePlacement`), which add it at the
 * band and position the answers give — one edit, with its own Undo. Done
 * closes the sheet; the page refreshes underneath it.
 */
export function AddEntryModal({
  open,
  onClose,
  onAdd,
  busy,
  error,
  listType,
  listName,
  onList,
  tierListId,
}: {
  open: boolean;
  onClose: () => void;
  /** The picks, in the order picked. */
  onAdd: (candidates: AddEntryCandidate[]) => void;
  busy: boolean;
  error: string | null;
  listType: string;
  /** The list's name: the sheet's "To …" line. */
  listName?: string;
  /** Board hrefs of the entries already on the list (`onListHrefs`). */
  onList: ReadonlySet<string>;
  tierListId: string;
}) {
  const client = useClient();
  const entityType: TierListEntityType = isValidListType(listType)
    ? listType
    : "place";
  const [text, setText] = useState("");
  const [rows, setRows] = useState<AddEntryCandidate[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [picks, setPicks] = useState<Picks>(() => new Map());
  /** L09: the one pick being placed by comparison, while it is. */
  const [placing, setPlacing] = useState<AddEntryCandidate | null>(null);
  /** A resubmit retires the search before it: only the newest may land. */
  const [searchGate] = useState(createLatestOnly);

  const toggle = useCallback(
    (candidate: AddEntryCandidate) =>
      setPicks((current) => togglePick(current, candidate)),
    [],
  );

  const clearSearch = useCallback(() => {
    searchGate.begin();
    setText("");
    setRows(null);
    setSearchError(null);
    setLoading(false);
  }, [searchGate]);

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
  const picked = Array.from(picks.values());
  const [onlyPick] = picked;

  if (placing !== null) {
    return (
      <ResponsiveDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        title={`Place ${placing.name}`}
        hideTitle
        className="md:max-w-[480px]"
      >
        <PairwisePlacement
          tierListId={tierListId}
          candidate={placing}
          onDone={onClose}
        />
      </ResponsiveDialog>
    );
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={`Add a ${entryNoun(entityType, 1)}`}
      {...(listName === undefined || listName === ""
        ? {}
        : { description: `To ${listName}` })}
      className="md:max-w-[480px]"
      footer={
        <div className="flex w-full flex-col gap-2">
          {/* W-1: an unrated pick has no band to compare within; plain Add
              puts it in Unrated, so Compare is not offered for it. */}
          {picked.length === 1 &&
            onlyPick !== undefined &&
            onlyPick.myScore !== null &&
            onlyPick.myScore !== undefined && (
              <Button
                variant="secondary"
                className="w-full"
                disabled={busy}
                onClick={() => setPlacing(onlyPick)}
              >
                Compare to place it
              </Button>
            )}
          <Button
            className="w-full"
            disabled={picked.length === 0 || busy}
            onClick={() => onAdd(picked)}
          >
            {busy && <Spinner aria-hidden />}
            {addButtonLabel(picked.length)}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        <form onSubmit={search} className="flex gap-2">
          <InputGroup className="flex-1">
            <InputGroupAddon>
              <SearchGlyph aria-hidden strokeWidth={ICON_STROKE} />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label={placeholder}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={placeholder}
            />
            {rows !== null && (
              <InputGroupAddon align="inline-end">
                {/* 32 pt drawn, 44 pt to the thumb (the ::after). */}
                <InputGroupButton
                  size="icon-sm"
                  aria-label="Clear search"
                  className="relative after:absolute after:-inset-1.5"
                  onClick={clearSearch}
                >
                  <Close aria-hidden strokeWidth={ICON_STROKE} />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
          <Button
            type="submit"
            variant="secondary"
            disabled={loading || text.trim() === ""}
          >
            {loading && <Spinner aria-hidden />}
            Search
          </Button>
        </form>

        {message !== null && (
          <p role="alert" className="t-body m-0 text-danger">
            {message}
          </p>
        )}

        {loading && rows === null ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : rows !== null ? (
          rows.length === 0 ? (
            <p className="t-body m-0 text-center text-ink-3">
              No {entryNoun(entityType, 1)} matches “{text.trim()}”
            </p>
          ) : (
            <CandidateList
              label="Search results"
              rows={rows}
              onList={onList}
              picks={picks}
              busy={busy}
              onToggle={toggle}
            />
          )
        ) : (
          <Suggestions
            open={open}
            tierListId={tierListId}
            entityType={entityType}
            onList={onList}
            picks={picks}
            busy={busy}
            onToggle={toggle}
          />
        )}
      </div>
    </ResponsiveDialog>
  );
}

/**
 * The three sections, asked for once per open. Each shows a few rows and a
 * "Show N more"; an empty section is not drawn, and with none at all the
 * sheet says what search is for instead.
 */
function Suggestions({
  open,
  tierListId,
  entityType,
  onList,
  picks,
  busy,
  onToggle,
}: {
  open: boolean;
  tierListId: string;
  entityType: TierListEntityType;
  onList: ReadonlySet<string>;
  picks: Picks;
  busy: boolean;
  onToggle: (candidate: AddEntryCandidate) => void;
}) {
  const [{ data, fetching, error }] = useQuery({
    query: TierListAddSuggestionsQuery,
    variables: { id: tierListId, first: SUGGESTIONS_PAGE_SIZE },
    // What you own and taste changes between opens: the last answer shows at
    // once and the fresh one replaces it (the sheet is remounted per open, so
    // this is one read per open). A row added since reads "On this list".
    requestPolicy: "cache-and-network",
    pause: !open,
  });
  const [expanded, setExpanded] = useState<ReadonlySet<AddEntrySection>>(
    () => new Set(),
  );

  const sections = useMemo(() => {
    if (data === undefined) return null;
    const result = unwrapResult(data.tierList, "TierList");
    if (!result.ok) return [];
    const nodes: SuggestionNode[] = result.data.addSuggestions.edges.map(
      (edge) => edge.node,
    );
    return suggestionSections(nodes, entityType);
  }, [data, entityType]);

  if (fetching && sections === null) {
    return (
      <div
        role="status"
        aria-label="Finding what you've had"
        className="flex flex-col gap-2"
      >
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (error !== undefined || sections === null || sections.length === 0) {
    return (
      <p className="t-body m-0 text-center text-ink-3">
        {error !== undefined
          ? "Couldn't load what you've had just now. Search instead."
          : `Search for ${entityType === "place" ? "a place" : "an item"} to add.`}{" "}
        It lands in the band your rating gives it, or Unrated.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {sections.map(({ section, rows }) => {
        const open = expanded.has(section);
        const shown = open ? rows : rows.slice(0, SECTION_PREVIEW);
        const hidden = rows.length - shown.length;
        return (
          <CandidateList
            key={section}
            label={sectionTitle(section, entityType)}
            heading
            rows={shown}
            onList={onList}
            picks={picks}
            busy={busy}
            onToggle={onToggle}
            more={
              hidden > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start text-ink-2"
                  onClick={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      next.add(section);
                      return next;
                    })
                  }
                >
                  Show {hidden} more
                </Button>
              ) : undefined
            }
          />
        );
      })}
    </div>
  );
}

/** A labelled list of pickable rows, with an optional visible heading. */
function CandidateList({
  label,
  heading = false,
  rows,
  onList,
  picks,
  busy,
  onToggle,
  more,
}: {
  label: string;
  heading?: boolean;
  rows: readonly AddEntryCandidate[];
  onList: ReadonlySet<string>;
  picks: Picks;
  busy: boolean;
  onToggle: (candidate: AddEntryCandidate) => void;
  more?: ReactNode;
}) {
  const headingId = useId();
  return (
    <section className="flex flex-col gap-1.5">
      {heading && (
        <h3 id={headingId} className="t-micro m-0 px-1 text-ink-2">
          {label}
        </h3>
      )}
      <ul
        aria-label={heading ? undefined : label}
        aria-labelledby={heading ? headingId : undefined}
        className="m-0 flex list-none flex-col divide-y divide-edge overflow-hidden rounded-md border border-edge bg-card p-0"
      >
        {rows.map((row) => {
          const key = candidateKey(row);
          return (
            <li key={key}>
              <CandidateRow
                row={row}
                onList={onList.has(key)}
                picked={picks.has(key)}
                busy={busy}
                onToggle={onToggle}
              />
            </li>
          );
        })}
      </ul>
      {more}
    </section>
  );
}

/**
 * One candidate, the whole row a checkbox: its name, why it is offered (or
 * what it is), then where it would land — "You 4 · Very Good" — or, already
 * on the board, "On this list" and nothing to press.
 */
export function CandidateRow({
  row,
  onList,
  picked = false,
  busy,
  onToggle,
}: {
  row: AddEntryCandidate;
  onList: boolean;
  picked?: boolean;
  busy: boolean;
  onToggle: (candidate: AddEntryCandidate) => void;
}) {
  const band = bandForScore(row.myScore);
  const tone = BAND_TONES[band] ?? BAND_TONES[0];
  const detail = [row.reason, row.subtitle]
    .filter((part): part is string => part !== undefined && part !== "")
    .join(" · ");
  return (
    // biome-ignore lint/a11y/useSemanticElements: a whole list row is the control (name, why, band); a native checkbox cannot hold that content
    <button
      type="button"
      role="checkbox"
      aria-checked={onList || picked}
      data-slot="add-entry-candidate"
      disabled={onList || busy}
      aria-disabled={onList || busy}
      onClick={() => {
        feedback("toggle");
        onToggle(row);
      }}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors focus-visible:bg-raised enabled:hover:bg-raised enabled:active:bg-raised",
        busy && !onList && "opacity-60",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full transition-colors",
          onList
            ? "text-success"
            : picked
              ? "bg-act text-on-act"
              : "border-2 border-edge-2",
        )}
      >
        {(onList || picked) && <Check strokeWidth={2.25} className="size-4" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="t-head truncate text-ink">{row.name}</span>
        {detail !== "" && (
          <span className="t-cap truncate text-ink-2">{detail}</span>
        )}
      </span>
      {onList ? (
        <span className="t-cap shrink-0 text-success">On this list</span>
      ) : (
        <span className="t-cap flex shrink-0 items-center gap-1.5 text-ink-2">
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
