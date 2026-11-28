import type { ReactNode } from "react";
import { EmptyState } from "@/components/app/EmptyState";
import {
  Add,
  CloudOff,
  ICON_STROKE,
  Place,
  Search,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { PersonRow } from "@/components/app/parts/PersonRow";
import { PlaceRow } from "@/components/app/parts/PlaceRow";
import { placeGlyph } from "@/components/map/core/PlaceFilters";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { RetrySearchButton } from "./RetrySearchButton";
import { DESKTOP_PREVIEW_SIZE, lookOrder } from "./search-quick-look";
import { PersonResultRow } from "./sections/PersonAction";
import { ResultRow } from "./sections/ResultRow";
import { ScopeRail } from "./sections/ScopeRail";
import { SearchQuickLook } from "./sections/SearchQuickLook";
import {
  allResultsHref,
  mapSearchHref,
  SECTION_LABELS,
  SECTION_PREVIEW_SIZE,
  type SearchRow,
  type SearchSection,
  type SectionModel,
  seeAllHref,
  totalLabel,
} from "./universal-search";

export { DESKTOP_PREVIEW_SIZE };

/**
 * A place row's kind glyph, as the map list draws it (F-184), from the
 * place's own category. Without one it falls to the plain pin.
 */
export function searchPlaceGlyph(row: Pick<SearchRow, "placeCategory">) {
  if (row.placeCategory == null || row.placeCategory === "") return Place;
  return placeGlyph({ primary_category: row.placeCategory, categories: [] });
}

function PlaceResult({ row }: { row: SearchRow }) {
  return (
    <PlaceRow
      data-search-row={row.key}
      name={
        row.href === undefined ? (
          row.title
        ) : (
          <Link href={row.href} overlay underline="none" className="text-ink">
            {row.title}
          </Link>
        )
      }
      glyph={searchPlaceGlyph(row)}
      where={row.description ?? ""}
      rating={row.rating ?? null}
    />
  );
}

function PersonResult({ row }: { row: SearchRow }) {
  if (row.person !== undefined) {
    return (
      <PersonResultRow
        userId={row.person.userId}
        name={row.person.name}
        avatarUrl={row.thumb.kind === "avatar" ? row.thumb.url : null}
        relation={row.person.relation}
        requestId={row.person.requestId}
      />
    );
  }
  return (
    <PersonRow
      name={
        row.href === undefined ? (
          row.title
        ) : (
          <Link href={row.href} overlay underline="none" className="text-ink">
            {row.title}
          </Link>
        )
      }
      displayName={row.title}
      avatarUrl={row.thumb.kind === "avatar" ? row.thumb.url : null}
      status={row.description}
      chevron={row.href !== undefined}
    />
  );
}

function Row({
  section,
  row,
  className,
}: {
  section: SearchSection;
  row: SearchRow;
  className?: string;
}) {
  return (
    <li className={cn("list-none", className)}>
      {section === "places" ? (
        <PlaceResult row={row} />
      ) : section === "people" ? (
        <PersonResult row={row} />
      ) : (
        <ResultRow row={row} />
      )}
    </li>
  );
}

/** "Your bottles  16  in Garage" … See all. */
function SectionHeader({
  model,
  id,
  action,
}: {
  model: SectionModel;
  id: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center gap-2">
      <h2 id={id} className="t-head flex min-w-0 items-baseline gap-2 text-ink">
        {model.label}
        <span className="t-cap tabular text-ink-2">{totalLabel(model)}</span>
        {model.context !== undefined && (
          <span className="t-cap truncate text-ink-2">{model.context}</span>
        )}
      </h2>
      {action !== undefined && <span className="ml-auto">{action}</span>}
    </div>
  );
}

const QUIET_LINK =
  "t-head relative inline-flex min-h-11 min-w-11 items-center justify-end text-act-ink";

/** One section: its first rows (three, six from `md`), and See all. */
function PreviewSection({
  model,
  query,
  index,
}: {
  model: SectionModel;
  query: string;
  index: number;
}) {
  const id = `search-section-${model.section}`;
  const moreOnPhone = model.total > SECTION_PREVIEW_SIZE;
  const moreOnDesk = model.total > DESKTOP_PREVIEW_SIZE;
  return (
    <section
      aria-labelledby={id}
      data-search-section={model.section}
      className="flex flex-col gap-2 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both duration-(--ca-dur-short) ease-enter motion-reduce:animate-none"
      style={{ animationDelay: `${Math.min(index, 5) * 40}ms` }}
    >
      <SectionHeader
        model={model}
        id={id}
        action={
          moreOnPhone ? (
            <Link
              href={seeAllHref(model.section, query)}
              underline="none"
              className={cn(QUIET_LINK, !moreOnDesk && "md:hidden")}
            >
              See all
              <span className="sr-only"> {model.label.toLowerCase()}</span>
            </Link>
          ) : undefined
        }
      />
      <ul className="m-0 grid gap-2 p-0 md:grid-cols-2 xl:grid-cols-3">
        {model.rows.slice(0, DESKTOP_PREVIEW_SIZE).map((row, rowIndex) => (
          <Row
            key={row.key}
            section={model.section}
            row={row}
            className={
              rowIndex >= SECTION_PREVIEW_SIZE ? "max-md:hidden" : undefined
            }
          />
        ))}
      </ul>
    </section>
  );
}

/** A Nothing-found or failure face: glyph, title, one action (KIT § 2). */
function Notice({
  glyph,
  title,
  action,
}: {
  glyph: ReactNode;
  title: string;
  action: ReactNode;
}) {
  return (
    <EmptyState
      className="py-10"
      illustration={glyph}
      title={title}
      action={action}
    />
  );
}

/** "+ Add “sotol”": the catalog's door, with the words already typed. */
export function AddQueryLink({ query }: { query: string }) {
  return (
    <Link
      href={`/add?name=${encodeURIComponent(query)}`}
      underline="none"
      className={cn(
        buttonVariants({ variant: "outline" }),
        "h-auto min-h-11 whitespace-normal text-center text-ink",
      )}
    >
      <Add aria-hidden strokeWidth={ICON_STROKE} />
      Add &ldquo;{query}&rdquo;
    </Link>
  );
}

/** "See all": one section, every row it holds, its chip lit above. */
function OpenSection({
  section,
  model,
  query,
  unanswered,
}: {
  section: SearchSection;
  model: SectionModel | undefined;
  query: string;
  unanswered: boolean;
}) {
  const label = SECTION_LABELS[section];
  if (model === undefined) {
    return unanswered ? (
      <Notice
        glyph={<CloudOff aria-hidden strokeWidth={1.5} />}
        title={`Couldn't search ${label.toLowerCase()}`}
        action={<RetrySearchButton />}
      />
    ) : (
      <Notice
        glyph={<Search aria-hidden strokeWidth={1.5} />}
        title={`No ${label.toLowerCase()} match “${query}”`}
        action={
          <Link
            href={allResultsHref(query)}
            underline="none"
            className={cn(buttonVariants({ variant: "outline" }), "text-ink")}
          >
            Search all
          </Link>
        }
      />
    );
  }
  const id = `search-section-${section}`;
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-2"
      data-search-open-section={section}
    >
      <SectionHeader
        model={model}
        id={id}
        action={
          section === "places" ? (
            <Link
              href={mapSearchHref(query)}
              underline="none"
              className={QUIET_LINK}
            >
              Map
            </Link>
          ) : undefined
        }
      />
      <ul
        data-search-section={section}
        className="m-0 grid gap-2 p-0 md:grid-cols-2 xl:grid-cols-3"
      >
        {model.rows.map((row) => (
          <Row key={row.key} section={section} row={row} />
        ))}
      </ul>
      {/* F-99: See all holds one read's rows; when the total is more, it says
          so and how to reach the rest, rather than ending as if complete. */}
      {(model.total > model.rows.length || model.totalIsLowerBound) &&
        model.rows.length > 0 && (
          <p className="t-cap m-0 text-ink-2" data-search-capped>
            The first {model.rows.length} of {totalLabel(model)}. Add a word to
            narrow them.
          </p>
        )}
    </section>
  );
}

/**
 * Universal search's results (X12, D10; Recipes-Search 08–28): the scope
 * chips, then the sections that found something, in order, with their real
 * totals ("200+" when the API's count is a lower bound) and See all; or the
 * one section See all opened, its chip lit; or one empty or error face.
 *
 * Server-renderable: the client islands are the chips and the person rows.
 */
export function SearchSections({
  query,
  sections,
  focus,
  semanticSearch,
  unanswered = false,
  failed = [],
}: {
  query: string;
  sections: readonly SectionModel[];
  /** `?in=`: the section "See all" opened, or null for every section. */
  focus: SearchSection | null;
  /** D25: false says the deployment matches names only. */
  semanticSearch: boolean | null;
  /**
   * Every search asked for failed (`searchUnanswered`): an error, not
   * "Nothing matches", which the page cannot know.
   */
  unanswered?: boolean;
  /** Sections whose search failed while others answered: one row says so. */
  failed?: readonly SearchSection[];
}) {
  const rail = (
    <ScopeRail
      query={query}
      focus={focus}
      counts={
        focus === null
          ? sections.map((model) => ({
              section: model.section,
              label: totalLabel(model),
            }))
          : []
      }
    />
  );

  if (focus !== null) {
    return (
      <div className="flex flex-col gap-4">
        {rail}
        <SearchQuickLook rows={lookOrder(sections, focus)}>
          <OpenSection
            section={focus}
            model={sections.find((model) => model.section === focus)}
            query={query}
            unanswered={unanswered}
          />
        </SearchQuickLook>
      </div>
    );
  }

  if (sections.length === 0 && unanswered) {
    return (
      <Notice
        glyph={<CloudOff aria-hidden strokeWidth={1.5} />}
        title="Search isn't answering"
        action={<RetrySearchButton />}
      />
    );
  }

  // F-96: nothing found, but a section could not be searched: the page does
  // not know there is no match there, so it says which, and offers no Add
  // (the drink may well exist).
  if (sections.length === 0 && failed.length > 0) {
    return (
      <Notice
        glyph={<CloudOff aria-hidden strokeWidth={1.5} />}
        title={`Couldn't search ${failed
          .map((section) => SECTION_LABELS[section].toLowerCase())
          .join(", ")}`}
        action={<RetrySearchButton />}
      />
    );
  }

  if (sections.length === 0) {
    return (
      <Notice
        glyph={<Search aria-hidden strokeWidth={1.5} />}
        title={`Nothing matches “${query}”`}
        action={<AddQueryLink query={query} />}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6" data-search-sections>
      {rail}
      {semanticSearch === false && (
        <p className="t-cap m-0 rounded-md bg-raised px-3 py-2 text-ink-2">
          Matching names only
        </p>
      )}
      {/* F-42: J/K, Enter and the desktop pane over these rows. */}
      <SearchQuickLook rows={lookOrder(sections, null)}>
        <div className="flex flex-col gap-6">
          {sections.map((model, index) => (
            <PreviewSection
              key={model.section}
              model={model}
              query={query}
              index={index}
            />
          ))}
        </div>
      </SearchQuickLook>
      {failed.length > 0 && (
        <div
          role="status"
          className="flex min-h-14 items-center gap-3 rounded-md border border-edge px-3"
        >
          <CloudOff
            aria-hidden
            strokeWidth={ICON_STROKE}
            className="size-5 shrink-0 text-glyph"
          />
          <span className="t-cap min-w-0 flex-1 text-ink-2">
            Couldn&apos;t search{" "}
            {failed
              .map((section) => SECTION_LABELS[section].toLowerCase())
              .join(", ")}
          </span>
          <RetrySearchButton quiet />
        </div>
      )}
    </div>
  );
}
