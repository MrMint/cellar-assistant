import Image from "next/image";
import { EmptyState } from "@/components/app/EmptyState";
import {
  Back,
  ChevronRight,
  ICON_STROKE,
  NoResults,
  Place,
  Recipe,
  Store,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { InsetSection, ListRow } from "@/components/app/Page";
import { Score } from "@/components/app/Score";
import { itemTypeTokens, TypeGlyph } from "@/components/app/TypeChip";
import { UserAvatar } from "@/components/app/UserAvatar";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { cn } from "@/lib/utils";
import { AddFriendButton } from "./AddFriendButton";
import { AddItemLink } from "./NoSearchResults";
import {
  allResultsHref,
  hasMore,
  type RowThumb,
  SECTION_LABELS,
  SECTION_PREVIEW_SIZE,
  type SearchRow,
  type SearchSection,
  type SectionModel,
  seeAllHref,
} from "./universal-search";

const ICONS = { place: Place, recipe: Recipe, brand: Store } as const;

const isItemType = (value: string): value is ApiItemType =>
  value in itemTypeTokens;

/** 44 pt: the photo, the item type's glyph on its tint, an icon, or a face. */
function Thumb({ thumb }: { thumb: RowThumb }) {
  switch (thumb.kind) {
    case "image":
      return (
        <span className="relative block size-11 overflow-hidden rounded-sm bg-surface-2">
          <Image
            src={thumb.url}
            alt=""
            fill
            sizes="44px"
            className="object-cover"
          />
        </span>
      );
    case "item":
      return isItemType(thumb.itemType) ? (
        <span
          className={cn(
            "flex size-11 items-center justify-center rounded-sm",
            itemTypeTokens[thumb.itemType].tintClass,
          )}
        >
          <TypeGlyph type={thumb.itemType} className="size-5" />
        </span>
      ) : (
        <span className="block size-11 rounded-sm bg-surface-2" />
      );
    case "avatar":
      return (
        <UserAvatar
          avatarUrl={thumb.url}
          displayName={thumb.name}
          className="size-11"
          aria-hidden
        />
      );
    case "icon": {
      const Icon = ICONS[thumb.icon];
      return (
        <span className="flex size-11 items-center justify-center rounded-sm bg-surface-2 text-ink-2">
          <Icon aria-hidden strokeWidth={ICON_STROKE} className="size-5" />
        </span>
      );
    }
  }
}

function Row({ row }: { row: SearchRow }) {
  const trailing =
    row.addFriend !== undefined ? (
      <AddFriendButton
        userId={row.addFriend.userId}
        name={row.addFriend.name}
      />
    ) : row.score !== undefined && row.score !== null ? (
      <Score value={row.score} />
    ) : row.href !== undefined ? (
      <ChevronRight aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
    ) : undefined;
  return (
    <ListRow
      data-search-row={row.key}
      leading={<Thumb thumb={row.thumb} />}
      title={
        row.href === undefined ? (
          row.title
        ) : (
          <Link href={row.href} overlay underline="none" className="text-ink-1">
            {row.title}
          </Link>
        )
      }
      description={row.description}
      trailing={trailing}
    />
  );
}

/** One section: its first three rows, and "See all" when it holds more. */
function PreviewSection({
  model,
  query,
  index,
}: {
  model: SectionModel;
  query: string;
  index: number;
}) {
  return (
    <InsetSection
      data-search-section={model.section}
      label={model.label}
      // Sections settle in one after another rather than all at once — a
      // short stagger, transform and opacity only, and none at all under
      // reduced motion (the root `MotionConfig` / `motion-reduce:`).
      className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both duration-(--ca-dur-short) ease-enter motion-reduce:animate-none"
      style={{ animationDelay: `${Math.min(index, 5) * 40}ms` }}
      action={
        hasMore(model) ? (
          <Link
            href={seeAllHref(model.section, query)}
            underline="none"
            className="type-callout relative font-medium text-ink-2 after:absolute after:-inset-y-3 after:-inset-x-2 after:content-['']"
          >
            See all
            <span className="sr-only"> {model.label.toLowerCase()}</span>
          </Link>
        ) : undefined
      }
    >
      {model.rows.slice(0, SECTION_PREVIEW_SIZE).map((row) => (
        <Row key={row.key} row={row} />
      ))}
    </InsetSection>
  );
}

/** "See all": one section, every row it holds, and the way back. */
function OpenSection({
  section,
  model,
  query,
}: {
  section: SearchSection;
  model: SectionModel | undefined;
  query: string;
}) {
  const label = SECTION_LABELS[section];
  return (
    <div className="flex flex-col gap-4" data-search-open-section={section}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="type-headline text-ink-1">
          {label} for &ldquo;{query}&rdquo;
        </h2>
        <Link
          href={allResultsHref(query)}
          underline="none"
          className="type-callout relative inline-flex shrink-0 items-center gap-1 font-medium text-ink-2 after:absolute after:-inset-y-3 after:-inset-x-2 after:content-['']"
        >
          <Back aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
          All results
        </Link>
      </div>
      {model === undefined ? (
        <p className="type-body py-6 text-center text-ink-2">
          No {label.toLowerCase()} for &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <InsetSection data-search-section={section}>
          {model.rows.map((row) => (
            <Row key={row.key} row={row} />
          ))}
        </InsetSection>
      )}
      {section === "items" && (
        <div className="flex flex-col items-center">
          <AddItemLink variant="ghost">
            Can&apos;t find it? Add an item
          </AddItemLink>
        </div>
      )}
    </div>
  );
}

/**
 * Universal search's results (X12, D10): the sections that found something,
 * in order, three rows each; or one section opened by "See all"; or, when
 * nothing anywhere matched, one empty state with one action.
 *
 * Server-renderable: the only client island is `AddFriendButton`.
 */
export function SearchSections({
  query,
  sections,
  focus,
  semanticSearch,
}: {
  query: string;
  sections: readonly SectionModel[];
  /** `?in=`: the section "See all" opened, or null for every section. */
  focus: SearchSection | null;
  /** D25: false says the deployment matches names only. */
  semanticSearch: boolean | null;
}) {
  if (focus !== null) {
    return (
      <OpenSection
        section={focus}
        model={sections.find((model) => model.section === focus)}
        query={query}
      />
    );
  }

  if (sections.length === 0) {
    return (
      <EmptyState
        illustration={<NoResults aria-hidden strokeWidth={1.5} />}
        title={`Nothing called “${query}” yet.`}
        description="Check the spelling, or add it to the catalog."
        action={<AddItemLink>Add an item</AddItemLink>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6" data-search-sections>
      {semanticSearch === false && (
        <p className="type-footnote px-4 text-ink-3">
          Matching names only: search by meaning is off.
        </p>
      )}
      {sections.map((model, index) => (
        <PreviewSection
          key={model.section}
          model={model}
          query={query}
          index={index}
        />
      ))}
    </div>
  );
}
