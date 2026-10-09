import { ICON_STROKE, Place } from "@/components/app/icons";
import { TypeGlyph } from "@/components/app/TypeChip";
import {
  type ApiItemType,
  ITEM_TYPES,
  itemTypeLabel,
} from "@/components/cellar-api/itemTypes";
import { BAND_LABELS, BAND_TONES } from "@/components/tier-list/constants";
import { groupByBand, type RankedEntry } from "@/lib/share/tier-bands";
import { cn } from "@/lib/utils";
import { formatCountry } from "@/utilities/formatters";

export type SharedTierListEntryView = {
  id: string;
  band: number;
  position: number;
  notes: string | null;
  entryType: string;
  name: string | null;
  location: string | null;
  imageUrl: string | null;
};

/**
 * The actor joins an item's region and its `country` **enum** ("Sonoma,
 * UNITED_STATES"); the in-app list formats the country client-side
 * (`tier-list/adapter.ts`), so the share page does the same. Only a segment
 * shaped like an enum value is touched — a place's two-letter country code
 * and a free-text region pass through as written.
 */
export const displayLocation = (location: string): string =>
  location
    .split(", ")
    .map((part) =>
      /^[A-Z]{3,}(_[A-Z]+)*$/.test(part) ? (formatCountry(part) ?? part) : part,
    )
    .join(", ");

export type SharedTierListViewProps = {
  name: string;
  description: string | null;
  listType: string;
  ownerDisplayName: string | null;
  entries: readonly SharedTierListEntryView[];
  /** Entries beyond the ones loaded (a list longer than one page). */
  moreCount: number;
};

const isItemType = (value: string): value is ApiItemType =>
  (ITEM_TYPES as readonly string[]).includes(value);

/** "Wine list", "Places" — the overline above the title. */
const listKind = (listType: string): string => {
  const upper = listType.toUpperCase();
  if (upper === "PLACE") return "Places";
  return isItemType(upper) ? itemTypeLabel(upper) : "Tier list";
};

function Thumb({ entry }: { entry: SharedTierListEntryView }) {
  if (entry.imageUrl !== null) {
    return (
      // biome-ignore lint/performance/noImgElement: a presigned file URL that expires; the optimiser would cache it under a key that stops working.
      <img
        src={entry.imageUrl}
        alt=""
        loading="lazy"
        className="size-12 shrink-0 rounded-md bg-surface-2 object-cover"
      />
    );
  }
  const type = entry.entryType;
  return (
    <span
      aria-hidden
      className="flex size-12 shrink-0 items-center justify-center rounded-md bg-surface-2"
    >
      {isItemType(type) ? (
        <TypeGlyph type={type} className="size-5" />
      ) : (
        <Place strokeWidth={ICON_STROKE} className="size-5 text-ink-3" />
      )}
    </span>
  );
}

function EntryRow({ entry }: { entry: RankedEntry<SharedTierListEntryView> }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        className={cn(
          "type-title-2 tabular w-8 shrink-0 pt-2 text-right font-display",
          entry.rank === 1 ? "text-brand-ink" : "text-ink-3",
        )}
      >
        {entry.rank === null ? "–" : entry.rank}
      </span>
      <Thumb entry={entry} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
        <p className="type-body font-medium text-ink-1">
          {entry.name ?? "Unavailable"}
        </p>
        {entry.location !== null && (
          <p className="type-footnote truncate">
            {displayLocation(entry.location)}
          </p>
        )}
        {entry.notes !== null && entry.notes.trim() !== "" && (
          <p className="type-callout line-clamp-3 text-ink-2 italic">
            “{entry.notes.trim()}”
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * A public tier list, read-only (X17): the bands in board order, each
 * entry's derived rank, its photo or type glyph, and what the author wrote
 * about it. No editing affordance, no insights, nothing viewer-relative.
 */
export function SharedTierListView({
  name,
  description,
  listType,
  ownerDisplayName,
  entries,
  moreCount,
}: SharedTierListViewProps) {
  const groups = groupByBand(entries);
  return (
    <>
      <header className="flex flex-col gap-1 pt-2">
        <p className="type-overline text-ink-3">
          {listKind(listType)} · ranked
        </p>
        <h1 className="type-large-title break-words font-display text-ink-1">
          {name}
        </h1>
        {ownerDisplayName !== null && (
          <p className="type-callout text-ink-2">by {ownerDisplayName}</p>
        )}
        {description !== null && description.trim() !== "" && (
          <p className="type-body pt-2 text-ink-2">{description}</p>
        )}
      </header>

      {groups.length === 0 ? (
        <p className="type-body rounded-lg bg-surface-1 p-4 text-ink-2">
          Nothing ranked here yet.
        </p>
      ) : (
        groups.map((group) => {
          const tone = BAND_TONES[group.band] ?? BAND_TONES[0];
          const label = BAND_LABELS[group.band] ?? "Unrated";
          return (
            <section
              key={group.band}
              aria-label={label}
              className="flex flex-col gap-2"
            >
              <h2 className="flex items-center gap-2 px-1">
                <span
                  aria-hidden
                  className={cn("size-3 rounded-full", tone?.swatch)}
                />
                <span className="type-headline text-ink-1">{label}</span>
                <span className="type-footnote">{group.entries.length}</span>
              </h2>
              <ol
                className={cn(
                  "flex flex-col divide-y divide-line overflow-hidden rounded-lg border-l-[3px] bg-surface-1",
                  tone?.rule,
                )}
              >
                {group.entries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
              </ol>
            </section>
          );
        })
      )}

      {moreCount > 0 && (
        <p className="type-callout text-center text-ink-2">
          And {moreCount} more — join to see the whole list.
        </p>
      )}
    </>
  );
}
