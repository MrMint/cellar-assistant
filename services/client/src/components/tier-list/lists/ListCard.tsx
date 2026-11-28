/**
 * A list on the index (Social-Lists 01). Yours: a four-photo strip of the
 * top entries with their rank chips, the name, privacy · count · date, and
 * the five-band bar. Someone else's: the compact card, their avatar, "Maya
 * Chen · 5 wines" and the bar. The whole card is the link (an overlay), and
 * it presses at .97 like every card.
 */

import {
  type AppIcon,
  ChevronRight,
  ICON_STROKE,
  Lock,
  People,
  Place,
  Public,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { BAND_FILL, type Band, bandName } from "@/components/app/parts/Rank";
import { MorphTitle } from "@/components/app/RouteTransition";
import { TypeGlyph } from "@/components/app/TypeChip";
import { UserAvatar } from "@/components/app/UserAvatar";
import {
  type ApiItemType,
  ITEM_TYPES,
} from "@/components/cellar-api/itemTypes";
import { cn } from "@/lib/utils";
import {
  type BandStrip as BandStripData,
  bandStrip,
  bandStripFromCounts,
  kindNoun,
  shortDate,
} from "./model";
import type { ListCardData } from "./queries";

const PRIVACY: Record<string, { icon: AppIcon; label: string }> = {
  PRIVATE: { icon: Lock, label: "Only me" },
  FRIENDS: { icon: People, label: "Friends" },
  PUBLIC: { icon: Public, label: "Everyone" },
};

const isItemType = (value: string): value is ApiItemType =>
  (ITEM_TYPES as readonly string[]).includes(value);

/**
 * F-181: the card's bar from `bandCounts` (F-85), every entry counted. An
 * answer without it (fixtures written before F-85 still carry the old
 * first-100 `bands` read) keeps the old drawing: the bands it holds, the
 * rest neutral, never guessed.
 */
const stripOf = (list: ListCardData): BandStripData => {
  if (Array.isArray(list.bandCounts))
    return bandStripFromCounts(list.bandCounts);
  const legacy = (
    list as { bands?: { edges: readonly { node: { band: number } }[] } }
  ).bands;
  return bandStrip(
    legacy?.edges.map((edge) => edge.node.band) ?? [],
    list.itemCount,
  );
};

/** The five-band bar: one segment per band, a stub for an empty one. */
export function BandStrip({
  strip,
  className,
}: {
  strip: BandStripData;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      data-slot="band-strip"
      className={cn("flex h-1.5 items-stretch gap-1", className)}
    >
      {strip.segments.map((segment) => (
        <span
          key={segment.band}
          data-band={segment.band}
          className={cn(
            "rounded-full",
            segment.count === 0 ? "w-1 bg-edge" : BAND_FILL[segment.band],
          )}
          style={segment.count === 0 ? undefined : { flexGrow: segment.count }}
        />
      ))}
      {strip.unloaded > 0 && (
        <span
          data-slot="band-strip-rest"
          className="rounded-full bg-edge"
          style={{ flexGrow: strip.unloaded }}
        />
      )}
    </div>
  );
}

type TopEntry = NonNullable<ListCardData["top"]>["edges"][number]["node"];

const photoOf = (entry: TopEntry): string | null =>
  entry.item?.images.edges[0]?.node.file?.url ??
  entry.place?.photos.edges[0]?.node.file?.url ??
  null;

function StripCell({ entry, rank }: { entry: TopEntry; rank: number }) {
  const url = photoOf(entry);
  const type = entry.entryType;
  const band = (entry.band >= 1 && entry.band <= 5 ? entry.band : 1) as Band;
  return (
    <div className="relative aspect-square overflow-hidden bg-raised">
      {url !== null ? (
        // biome-ignore lint/performance/noImgElement: a presigned file URL that expires; the optimiser would cache it under a key that stops working.
        <img
          src={url}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      ) : (
        <span className="flex size-full items-center justify-center">
          {isItemType(type) ? (
            <TypeGlyph type={type} className="size-1/3 text-ink-3" />
          ) : (
            <Place
              aria-hidden
              strokeWidth={ICON_STROKE}
              className="size-1/3 text-ink-3"
            />
          )}
        </span>
      )}
      {entry.band > 0 && (
        // F-21: the board's small dark chip; the band stays in the strip
        // beneath the card, and in the words for a screen reader.
        <span
          data-slot="rank-chip"
          data-band={band}
          className="t-micro tabular absolute bottom-2 left-2 inline-flex h-5 min-w-8 items-center justify-center rounded-sm bg-glass px-1.5 text-on-glass"
        >
          #{rank}
          <span className="sr-only">, {bandName(band)}</span>
        </span>
      )}
    </div>
  );
}

function CardLink({
  id,
  name,
  onNavigate,
  className,
}: {
  id: string;
  name: string;
  onNavigate?: () => void;
  className?: string;
}) {
  const href = `/tier-lists/${id}`;
  return (
    <h3 className={cn("m-0 min-w-0 flex-1 text-ink", className)}>
      <Link
        href={href}
        overlay
        underline="none"
        onClick={onNavigate}
        className="rounded-lg"
      >
        {/* B05: flies into the list page's heading. */}
        <MorphTitle href={href}>
          <span className="line-clamp-2 break-words">{name}</span>
        </MorphTitle>
      </Link>
    </h3>
  );
}

const CARD =
  "relative overflow-hidden rounded-lg border border-edge bg-card transition-transform duration-(--ca-dur-micro) ease-standard active:scale-97 motion-reduce:active:scale-100 [@media(hover:hover)]:hover:bg-raised";

export function ListCard({
  list,
  mine,
  onNavigate,
  now,
}: {
  list: ListCardData;
  /** Yours draw the photo strip; others the compact card. */
  mine: boolean;
  onNavigate?: () => void;
  /** For the date's year; tests pass a fixed one. */
  now?: Date;
}) {
  const privacy = PRIVACY[list.privacy] ?? PRIVACY.PRIVATE;
  const PrivacyIcon = privacy.icon;
  const strip = stripOf(list);
  const count = kindNoun(list.listType, list.itemCount);
  const privacyGlyph = (
    <>
      <PrivacyIcon
        aria-hidden
        strokeWidth={ICON_STROKE}
        className="size-4 shrink-0 text-ink-3"
      />
      <span className="sr-only">{privacy.label}, </span>
    </>
  );

  if (mine) {
    const top = list.top.edges.map((edge) => edge.node);
    const date = shortDate(list.contentUpdatedAt, now);
    return (
      <article data-slot="list-card" className={CARD}>
        {top.length > 0 && (
          <div className="grid grid-cols-4 gap-0.5" aria-hidden>
            {top.map((entry, index) => (
              <StripCell key={entry.id} entry={entry} rank={index + 1} />
            ))}
            {Array.from({ length: 4 - top.length }, (_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed filler cells.
              <div key={index} className="aspect-square bg-raised" />
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2 px-4 pt-3 pb-4">
          <div className="flex items-start gap-2">
            <CardLink
              id={list.id}
              name={list.name}
              onNavigate={onNavigate}
              className="t-head"
            />
            <ChevronRight
              aria-hidden
              strokeWidth={ICON_STROKE}
              className="mt-1 size-5 shrink-0 text-ink-3"
            />
          </div>
          <p className="t-body m-0 flex items-center gap-2 text-ink-2">
            {privacyGlyph}
            <span className="tabular">
              {count}
              {date !== null && ` · ${date}`}
            </span>
          </p>
          <BandStrip strip={strip} className="mt-1" />
        </div>
      </article>
    );
  }

  const owner = list.createdBy?.displayName ?? "Someone";
  return (
    <article
      data-slot="list-card"
      className={cn(CARD, "flex min-h-11 items-center gap-4 px-4 py-4")}
    >
      <UserAvatar
        avatarUrl={list.createdBy?.avatarUrl}
        displayName={owner}
        size="lg"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <CardLink
          id={list.id}
          name={list.name}
          onNavigate={onNavigate}
          className="t-head"
        />
        <p className="t-body m-0 flex min-w-0 items-center gap-2 text-ink-2">
          {list.privacy === "PUBLIC" && privacyGlyph}
          <span className="truncate">
            {owner} · <span className="tabular">{count}</span>
          </span>
        </p>
        <BandStrip strip={strip} className="mt-1 max-w-[30rem]" />
      </div>
      <ChevronRight
        aria-hidden
        strokeWidth={ICON_STROKE}
        className="size-5 shrink-0 text-ink-3"
      />
    </article>
  );
}
