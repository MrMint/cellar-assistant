"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { useClient, useQuery } from "urql";
import { FilterChip } from "@/components/app/FilterChip";
import {
  Add,
  Check,
  ChevronLeft,
  ChevronRight,
  Close,
  ICON_STROKE,
  Place,
  Search,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { BandMarker, BANDS as RANKED_BANDS } from "@/components/app/parts/Rank";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { formatScore } from "@/components/app/Score";
import {
  type CreatedPlace,
  NewPlaceSheet,
} from "@/components/capture/NewPlaceSheet";
import { useGeolocation } from "@/components/map/hooks/useGeolocation";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
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
  CAFE_CATEGORIES,
  candidateKey,
  isUnratedPick,
  type Picks,
  picksSummary,
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

/** F-177: how long typing rests before the picker searches. */
const SEARCH_DEBOUNCE_MS = 300;

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
  bandCounts,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * The picks, in the order picked. `band` is the band step's answer for
   * the picks your rating gives none (F-175); a rated pick keeps its own.
   */
  onAdd: (candidates: AddEntryCandidate[], band?: number) => void;
  busy: boolean;
  error: string | null;
  listType: string;
  /** The list's name: the sheet's "To …" line. */
  listName?: string;
  /** Board hrefs of the entries already on the list (`onListHrefs`). */
  onList: ReadonlySet<string>;
  tierListId: string;
  /** How many sit in each band now: the band step's counts. */
  bandCounts?: Readonly<Record<number, number>>;
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
  /** F-175: several picks, one of them unrated: the band step is showing. */
  const [banding, setBanding] = useState(false);
  /** F-180: a place search keeps only cafés. */
  const [cafesOnly, setCafesOnly] = useState(false);
  /** F-177: "Add a new place" is showing the new-place sheet. */
  const [creatingPlace, setCreatingPlace] = useState(false);
  const geo = useGeolocation();
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

  const runSearch = useCallback(
    async (phrase: string) => {
      if (phrase === "") return;
      const isCurrent = searchGate.begin();
      setLoading(true);
      setSearchError(null);

      if (entityType === "place") {
        const response = await client
          .query(TierListPlacePickerQuery, {
            query: phrase,
            first: PICKER_PAGE_SIZE,
            filterCategories: cafesOnly ? [...CAFE_CATEGORIES] : null,
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
    [cafesOnly, client, entityType, searchGate],
  );

  // F-177: the picker searches as you type, once typing rests; Enter still
  // searches at once. Emptying the field goes back to the sections.
  const phrase = text.trim();
  useEffect(() => {
    if (phrase === "") {
      clearSearch();
      return;
    }
    const timer = setTimeout(() => void runSearch(phrase), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [phrase, runSearch, clearSearch]);

  const search = (event: FormEvent) => {
    event.preventDefault();
    void runSearch(phrase);
  };

  const message = searchError ?? error;
  const placeholder =
    entityType === "place"
      ? "Search places by name or what they are"
      : `Search ${ENTITY_LABELS[entityType]} by name or description`;
  const SearchGlyph = entityType === "place" ? Place : Search;
  const picked = Array.from(picks.values());
  const [onlyPick] = picked;
  const showBandStep = banding && picked.length > 1;

  if (creatingPlace) {
    return (
      <NewPlaceSheet
        open={open}
        onOpenChange={(next) => {
          if (!next) setCreatingPlace(false);
        }}
        location={geo.location}
        hasPhoto={false}
        onCreated={(place: CreatedPlace) => {
          setCreatingPlace(false);
          // A new place is nobody's rating yet: the band step places it.
          setPlacing({
            id: place.id,
            entityType: "place",
            name: place.name,
            subtitle: "",
            myScore: null,
          });
        }}
        onPickInstead={() => setCreatingPlace(false)}
      />
    );
  }

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
      // F-175: the band step replaces the picker in the same sheet; the
      // picker stays mounted underneath, so Back finds the picks and the
      // sections as they were.
      {...(showBandStep
        ? { title: "Which band?", hideTitle: true }
        : {
            title: `Add a ${entryNoun(entityType, 1)}`,
            ...(listName === undefined || listName === ""
              ? {}
              : { description: `To ${listName}` }),
          })}
      className="md:max-w-[480px]"
      footer={
        showBandStep ? undefined : (
          <div className="flex w-full flex-col gap-2">
            {/* F-175: nothing lands in Unrated unasked. One pick is placed
              (its band, asked when your rating gives none, then the
              questions and where it landed); several with an unrated one
              ask Which band? first; several rated ones keep their bands. */}
            <Button
              className="w-full"
              disabled={picked.length === 0 || busy}
              onClick={() => {
                feedback("press");
                if (picked.length === 1 && onlyPick !== undefined) {
                  setPlacing(onlyPick);
                } else if (picked.some(isUnratedPick)) {
                  setBanding(true);
                } else {
                  onAdd(picked);
                }
              }}
            >
              {busy && <Spinner aria-hidden />}
              {addButtonLabel(picked.length)}
            </Button>
          </div>
        )
      }
    >
      {showBandStep && (
        <BandStep
          picks={picked}
          noun={(count) => entryNoun(entityType, count)}
          counts={bandCounts}
          busy={busy}
          error={error}
          onBack={() => setBanding(false)}
          onChoose={(band) => onAdd(picked, band)}
        />
      )}
      <div hidden={showBandStep} className="flex flex-col gap-4 pb-1">
        <form onSubmit={search} className="flex gap-2">
          <InputGroup className="flex-1">
            <InputGroupAddon>
              <SearchGlyph aria-hidden strokeWidth={ICON_STROKE} />
            </InputGroupAddon>
            {/* type="text": a search input draws the browser's own ✕ beside
                ours (F-177). */}
            <InputGroupInput
              type="text"
              enterKeyHint="search"
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
        </form>

        {entityType === "place" && (
          <div className="flex flex-wrap gap-2">
            <FilterChip
              selected={cafesOnly}
              onClick={() => setCafesOnly((on) => !on)}
            >
              Cafés only
            </FilterChip>
          </div>
        )}

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
            <NoMatch
              noun={entryNoun(entityType, 1)}
              phrase={phrase}
              {...(entityType === "place"
                ? {
                    onAddPlace: () => {
                      geo.request();
                      setCreatingPlace(true);
                    },
                  }
                : {
                    href: `/add?type=${entryTypeOf(entityType)}&name=${encodeURIComponent(phrase)}`,
                  })}
            />
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

/**
 * F-177 (KIT § 4): "No wine matches “q”" and its one action, Add a new
 * wine — the catalog's door with the words carried (`/add?type=&name=`), or
 * for a place list the new-place sheet.
 */
function NoMatch({
  noun,
  phrase,
  href,
  onAddPlace,
}: {
  noun: string;
  phrase: string;
  href?: string;
  onAddPlace?: () => void;
}) {
  const label = `Add a new ${noun}`;
  const action = cn(buttonVariants({ variant: "outline" }), "text-ink");
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <Search
        aria-hidden
        strokeWidth={ICON_STROKE}
        className="size-6 text-glyph"
      />
      <p className="t-head m-0 text-ink">
        No {noun} matches “{phrase}”
      </p>
      {href !== undefined ? (
        <Link
          href={href}
          underline="none"
          className={action}
          onClick={() => feedback("press")}
        >
          <Add aria-hidden strokeWidth={ICON_STROKE} />
          {label}
        </Link>
      ) : (
        <Button
          variant="outline"
          className="text-ink"
          onClick={() => {
            feedback("press");
            onAddPlace?.();
          }}
        >
          <Add aria-hidden strokeWidth={ICON_STROKE} />
          {label}
        </Button>
      )}
    </div>
  );
}

/**
 * F-175 (placing 06): several picks, one with no band of your own — the one
 * band they all go to. Back returns to the picks, still picked.
 */
function BandStep({
  picks,
  noun,
  counts,
  busy,
  error,
  onBack,
  onChoose,
}: {
  picks: readonly AddEntryCandidate[];
  noun: (count: number) => string;
  counts: Readonly<Record<number, number>> | undefined;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onChoose: (band: number) => void;
}) {
  return (
    <div data-slot="add-band-step" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Back"
          onClick={() => {
            feedback("press");
            onBack();
          }}
          className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-md text-ink outline-none focus-visible:bg-raised"
        >
          <ChevronLeft
            aria-hidden
            strokeWidth={ICON_STROKE}
            className="size-6"
          />
        </button>
        <span className="t-title text-ink" aria-hidden>
          Which band?
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="t-head tabular flex size-12 shrink-0 items-center justify-center rounded-md bg-raised text-ink">
          {picks.length}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="t-head truncate text-ink">
            {picks.length} {noun(picks.length)}
          </span>
          <span className="t-cap truncate text-ink-2">
            {picksSummary(picks)}
          </span>
        </div>
      </div>
      <fieldset aria-label="Band" className="m-0 flex flex-col border-0 p-0">
        {RANKED_BANDS.map(({ band, name }) => (
          <button
            key={band}
            type="button"
            disabled={busy}
            onClick={() => {
              feedback("tick");
              onChoose(band);
            }}
            className="-mx-2 flex h-[52px] items-center gap-3 rounded-md px-2 text-left outline-none active:bg-raised focus-visible:bg-raised disabled:opacity-50"
          >
            <BandMarker band={band} />
            <span className="t-head min-w-0 flex-1 truncate text-ink">
              {name}
            </span>
            <span className="t-cap tabular text-ink-3">
              {counts?.[band] ?? 0}
            </span>
            <ChevronRight
              aria-hidden
              strokeWidth={ICON_STROKE}
              className="size-5 text-glyph"
            />
          </button>
        ))}
      </fieldset>
      {busy && (
        <div className="flex justify-center">
          <Spinner aria-label="Adding" />
        </div>
      )}
      {error !== null && (
        <p role="alert" className="t-body m-0 text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
