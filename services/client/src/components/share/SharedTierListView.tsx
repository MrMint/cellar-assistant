import { ICON_STROKE, Place } from "@/components/app/icons";
import {
  type Band,
  BandMarker,
  bandName,
  RankChip,
} from "@/components/app/parts/Rank";
import { TypeGlyph } from "@/components/app/TypeChip";
import { UserAvatar } from "@/components/app/UserAvatar";
import {
  type ApiItemType,
  ITEM_TYPES,
} from "@/components/cellar-api/itemTypes";
import { kindNoun, rankedKind } from "@/components/tier-list/lists/model";
import { groupByBand, type RankedEntry } from "@/lib/share/tier-bands";
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
  /** Every entry on the list, loaded or not ("6 places"). */
  itemCount: number;
  entries: readonly SharedTierListEntryView[];
  /** Entries beyond the ones loaded (a list longer than one page). */
  moreCount: number;
};

const isItemType = (value: string): value is ApiItemType =>
  (ITEM_TYPES as readonly string[]).includes(value);

const isBand = (band: number): band is Band => band >= 1 && band <= 5;

function Thumb({ entry }: { entry: SharedTierListEntryView }) {
  if (entry.imageUrl !== null) {
    return (
      // biome-ignore lint/performance/noImgElement: a presigned file URL that expires; the optimiser would cache it under a key that stops working.
      <img
        src={entry.imageUrl}
        alt=""
        loading="lazy"
        className="size-12 shrink-0 rounded-md bg-raised object-cover"
      />
    );
  }
  const type = entry.entryType;
  return (
    <span
      aria-hidden
      className="flex size-12 shrink-0 items-center justify-center rounded-md border border-edge bg-raised"
    >
      {isItemType(type) ? (
        <TypeGlyph type={type} className="size-5 text-ink-3" />
      ) : (
        <Place strokeWidth={ICON_STROKE} className="size-5 text-ink-3" />
      )}
    </span>
  );
}

function EntryRow({ entry }: { entry: RankedEntry<SharedTierListEntryView> }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-edge bg-card p-3">
      <Thumb entry={entry} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <p className="t-head m-0 min-w-0 flex-1 break-words text-ink">
            {entry.name ?? "Unavailable"}
          </p>
          {entry.rank !== null && isBand(entry.band) && (
            <RankChip rank={entry.rank} band={entry.band} />
          )}
        </div>
        {entry.location !== null && (
          <p className="t-cap m-0 flex min-w-0 items-center gap-1 text-ink-2">
            {isItemType(entry.entryType) ? (
              <TypeGlyph
                type={entry.entryType}
                className="size-3.5 shrink-0 text-ink-3"
              />
            ) : (
              <Place
                aria-hidden
                strokeWidth={ICON_STROKE}
                className="size-3.5 shrink-0 text-ink-3"
              />
            )}
            <span className="truncate">{displayLocation(entry.location)}</span>
          </p>
        )}
        {entry.notes !== null && entry.notes.trim() !== "" && (
          <p className="t-quote m-0 line-clamp-3 text-ink-2">
            “{entry.notes.trim()}”
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * A public tier list, read-only (X17; Social-Lists, signed out): "Ranked
 * places", the name, the maker and the count, then the bands in board order
 * with each entry's derived rank. No editing affordance, nothing
 * viewer-relative.
 */
export function SharedTierListView({
  name,
  description,
  listType,
  ownerDisplayName,
  itemCount,
  entries,
  moreCount,
}: SharedTierListViewProps) {
  const groups = groupByBand(entries);
  const count = kindNoun(listType, itemCount);
  return (
    <>
      <header className="flex flex-col gap-2.5">
        <p className="t-cap m-0 text-ink-3">{rankedKind(listType)}</p>
        <h1 className="t-title m-0 break-words text-ink">{name}</h1>
        <p className="t-cap m-0 flex items-center gap-2 text-ink-2">
          {ownerDisplayName !== null && (
            <UserAvatar displayName={ownerDisplayName} size="sm" />
          )}
          <span className="tabular">
            {ownerDisplayName === null
              ? count
              : `${ownerDisplayName} · ${count}`}
          </span>
        </p>
        {description !== null && description.trim() !== "" && (
          <p className="t-body m-0 text-ink-2">{description}</p>
        )}
      </header>

      {groups.length === 0 ? (
        <p className="t-body m-0 rounded-lg border border-edge bg-card p-4 text-ink-2">
          Nothing ranked here yet.
        </p>
      ) : (
        groups.map((group) => {
          const label = isBand(group.band) ? bandName(group.band) : "Unrated";
          return (
            <section
              key={group.band}
              aria-label={label}
              data-band={group.band}
              className="flex flex-col"
            >
              <h2 className="sticky top-0 z-10 m-0 flex min-h-11 items-center gap-2 bg-bg">
                {isBand(group.band) && <BandMarker band={group.band} />}
                <span className="t-head flex-1 text-ink">{label}</span>
                <span className="t-cap tabular text-ink-3">
                  {group.entries.length}
                </span>
              </h2>
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {group.entries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
              </ol>
            </section>
          );
        })
      )}

      {moreCount > 0 && (
        <p className="t-cap m-0 tabular text-center text-ink-3">
          And {moreCount} more
        </p>
      )}
    </>
  );
}
