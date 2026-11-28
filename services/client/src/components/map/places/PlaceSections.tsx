"use client";

/**
 * The place page's sections (Places-Place 01, 02, desktop 01), shared by the
 * page and `PlacePane`: Your rank, where it is with Directions, the
 * Visited / Want to try / Share row, On your lists, the Menu card and Info.
 * Each is a card (surface-1, r8) or a plain block, as the board draws it.
 */

import type { ReactNode } from "react";
import { useQuery } from "urql";
import {
  ChevronRight,
  Directions,
  ICON_STROKE,
  MapIcon,
  People,
  Phone,
  Place,
  Public,
  Schedule,
  Share,
  Success,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { type Band, bandName, RankChip } from "@/components/app/parts/Rank";
import { TogglePop } from "@/components/app/TogglePop";
import { rankOf } from "@/components/tier-list/lists/model";
import { ListRanksQuery } from "@/components/tier-list/lists/queries";
import { Button } from "@/components/ui/button";
import { WantToTryButton } from "@/components/want-to-try/WantToTryButton";
import { unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import { formatTimeString } from "./place-utils";

export type PlaceListEntry = {
  id: string;
  band: number;
  tier_list: { id: string; name: string } | null;
};

const asBand = (band: number): Band | null =>
  band >= 1 && band <= 5 ? (band as Band) : null;

/** A card on the page: surface-1, r8, 16 in (KIT § 3). */
export function PlaceCard({
  label,
  action,
  className,
  children,
  ...props
}: {
  label?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
} & Omit<React.ComponentProps<"section">, "children">) {
  return (
    <section
      {...props}
      className={cn(
        "flex flex-col gap-3 rounded-lg bg-surface-1 p-4",
        className,
      )}
    >
      {(label !== undefined || action !== undefined) && (
        <div className="flex items-center justify-between gap-3">
          {label !== undefined && (
            <h2 className="t-micro text-ink-2">{label}</h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * An entry's place on its list: "#48" and "of 113", read from the list
 * itself (`ListRanksQuery`, 100 rows, the same read Add to a list makes),
 * so the page and the list never disagree about a rank (CROSS-LOT).
 */
function useEntryRank(entry: PlaceListEntry): {
  rank: number | null;
  total: number | null;
} {
  const listId = entry.tier_list?.id ?? "";
  const [{ data }] = useQuery({
    query: ListRanksQuery,
    variables: { id: listId },
    pause: listId === "",
  });
  const list = unwrapResult(data?.tierList, "TierList");
  if (!list.ok) return { rank: null, total: null };
  return {
    rank: rankOf(
      list.data.items.edges.map((edge) => edge.node),
      entry.id,
    ),
    total: list.data.itemCount,
  };
}

/** The public rating: the people glyph, "4.7 (240)", ink-3 — never gold. */
export function PlacePublicRating({
  rating,
  count,
}: {
  rating: number | null | undefined;
  count: number | null | undefined;
}) {
  if (rating === null || rating === undefined) return null;
  return (
    <p
      data-slot="public-rating"
      className="t-cap tabular inline-flex items-center gap-1 text-ink-2"
    >
      <People aria-hidden strokeWidth={ICON_STROKE} className="size-4" />
      <span className="t-head text-ink-2">{rating.toFixed(1)}</span>
      {count !== null && count !== undefined && <span>({count})</span>}
      <span className="sr-only">public rating</span>
    </p>
  );
}

/**
 * "Your rank": the first list's chip ("#48"), its band and "of 113 places",
 * opening the list; or "Not ranked" with Add to a list (Places-Place 01, 20).
 */
export function PlaceRankBlock({
  entries,
  rating,
  ratingCount,
  onAddToList,
}: {
  entries: readonly PlaceListEntry[];
  rating: number | null | undefined;
  ratingCount: number | null | undefined;
  onAddToList: () => void;
}) {
  const first = entries.find((entry) => asBand(entry.band) !== null) ?? null;
  return (
    <section
      data-slot="your-rank"
      aria-labelledby="place-your-rank"
      className="flex flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="place-your-rank" className="t-body text-ink-2">
          Your rank
        </h2>
        <PlacePublicRating rating={rating} count={ratingCount} />
      </div>
      {first === null ? (
        <div className="flex items-center justify-between gap-3">
          <p className="t-body text-ink-2">Not ranked</p>
          <Button variant="outline" onClick={onAddToList}>
            Add to a list
          </Button>
        </div>
      ) : (
        <FirstRank entry={first} />
      )}
    </section>
  );
}

function FirstRank({ entry }: { entry: PlaceListEntry }) {
  const band = asBand(entry.band) ?? 3;
  const { rank, total } = useEntryRank(entry);
  const list = entry.tier_list;
  return (
    <div className="relative flex min-h-14 items-center gap-3">
      {rank !== null ? (
        <RankChip
          rank={rank}
          band={band}
          className="t-title h-11 min-w-[70px] rounded-lg px-3"
        />
      ) : (
        <span
          aria-hidden
          className="h-11 w-[70px] shrink-0 rounded-lg bg-skel"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="t-head text-ink">
          {list ? (
            <Link href={`/tier-lists/${list.id}`} overlay underline="none">
              {bandName(band)}
            </Link>
          ) : (
            bandName(band)
          )}
        </span>
        <span className="t-cap truncate text-ink-2">
          {total !== null ? `of ${total} in ${list?.name ?? "your list"}` : ""}
        </span>
      </span>
      {list && (
        <ChevronRight
          aria-hidden
          strokeWidth={ICON_STROKE}
          className="size-5 shrink-0 text-glyph"
        />
      )}
    </div>
  );
}

/** One row of "On your lists": the chip, the list, the band. */
function ListRow({ entry }: { entry: PlaceListEntry }) {
  const band = asBand(entry.band);
  const { rank } = useEntryRank(entry);
  const list = entry.tier_list;
  if (list === null) return null;
  return (
    <li className="relative flex min-h-14 items-center gap-3">
      {band !== null && rank !== null ? (
        <RankChip rank={rank} band={band} />
      ) : (
        <span
          aria-hidden
          className="h-6 w-[38px] shrink-0 rounded-sm bg-skel"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="t-head truncate text-ink">
          <Link href={`/tier-lists/${list.id}`} overlay underline="none">
            {list.name}
          </Link>
        </span>
        {band !== null && (
          <span className="t-cap text-ink-2">{bandName(band)}</span>
        )}
      </span>
      <ChevronRight
        aria-hidden
        strokeWidth={ICON_STROKE}
        className="size-5 shrink-0 text-glyph"
      />
    </li>
  );
}

/** "On your lists" — only lists the viewer may see (G8). */
export function PlaceListsCard({
  entries,
}: {
  entries: readonly PlaceListEntry[];
}) {
  const shown = entries.filter((entry) => entry.tier_list !== null);
  if (shown.length === 0) return null;
  return (
    <PlaceCard label="On your lists" data-slot="on-your-lists">
      <ul className="-my-1 flex flex-col">
        {shown.map((entry) => (
          <ListRow key={entry.id} entry={entry} />
        ))}
      </ul>
    </PlaceCard>
  );
}

export type PlaceWhere = {
  id: string;
  name: string;
  street_address: string | null;
  locality: string | null;
  region: string | null;
  postcode: string | null;
  location: { coordinates: [number, number] } | null;
};

/**
 * Directions go to the street address; with none, to the pin's coordinates
 * and say so (Places-Place ruling 5).
 */
export const directionsTarget = (
  place: PlaceWhere,
): { url: string; label: string } => {
  if (place.street_address) {
    const address = [place.street_address, place.locality, place.region]
      .filter(Boolean)
      .join(", ");
    return {
      url: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`,
      label: "Directions",
    };
  }
  const coordinates = place.location?.coordinates;
  if (coordinates) {
    const [lng, lat] = coordinates;
    return {
      url: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
      label: "Directions to the pin",
    };
  }
  return {
    url: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place.name)}`,
    label: "Directions",
  };
};

/** Where it is: the address, the map, and the screen's one primary. */
export function PlaceWhereCard({
  place,
  children,
}: {
  place: PlaceWhere;
  /** The desktop column puts Visited / Want to try in the same card. */
  children?: ReactNode;
}) {
  const directions = directionsTarget(place);
  const cityLine = [place.locality, place.region].filter(Boolean).join(", ");
  return (
    <PlaceCard data-slot="place-where">
      <div className="flex items-center gap-3">
        <Place
          aria-hidden
          strokeWidth={ICON_STROKE}
          className="size-5 shrink-0 text-glyph"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="t-body text-ink">
            {place.street_address ?? cityLine ?? "No street address"}
          </p>
          {place.street_address && cityLine && (
            <p className="t-cap text-ink-2">{cityLine}</p>
          )}
        </div>
        <Button variant="ghost" size="icon" asChild>
          <Link
            href={`/map?placeId=${place.id}`}
            underline="none"
            aria-label="Show on the map"
          >
            <MapIcon aria-hidden strokeWidth={ICON_STROKE} />
          </Link>
        </Button>
      </div>
      <Button asChild className="w-full">
        <a href={directions.url} target="_blank" rel="noopener noreferrer">
          <Directions aria-hidden strokeWidth={ICON_STROKE} />
          {directions.label}
        </a>
      </Button>
      {children}
    </PlaceCard>
  );
}

/** Visited: one word in both states; the fill and the glyph say which. */
export function VisitedButton({
  on,
  pending,
  onToggle,
  className,
}: {
  on: boolean;
  pending: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="outline"
      aria-pressed={on}
      aria-busy={pending || undefined}
      onClick={onToggle}
      className={cn(on && "border-edge-2 bg-sel", className)}
    >
      <TogglePop on={on} pop={pending}>
        <Success
          aria-hidden
          strokeWidth={ICON_STROKE}
          className={on ? "text-act-ink" : undefined}
        />
      </TogglePop>
      Visited
    </Button>
  );
}

/** Visited, Want to try, Share — in that order (FIX-places ruling 1). */
export function PlaceActionsRow({
  placeId,
  placeName,
  visited,
  wantToTry,
  onShare,
  share = true,
}: {
  placeId: string;
  placeName: string;
  visited: { on: boolean; pending: boolean; toggle: () => void };
  wantToTry: boolean;
  onShare: () => void;
  /** The desktop column shares from its bar instead. */
  share?: boolean;
}) {
  return (
    <div
      data-slot="place-actions"
      className={cn("grid gap-2", share ? "grid-cols-3" : "grid-cols-2")}
    >
      <VisitedButton
        on={visited.on}
        pending={visited.pending}
        onToggle={visited.toggle}
        className="px-2"
      />
      <WantToTryButton
        variant="button"
        target={{ kind: "PLACE", placeId }}
        saved={wantToTry}
        name={placeName}
        className="px-2"
      />
      {share && (
        <Button variant="outline" className="px-2" onClick={onShare}>
          <Share aria-hidden strokeWidth={ICON_STROKE} />
          Share
        </Button>
      )}
    </div>
  );
}

// ── Info ───────────────────────────────────────────────────────────────

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** An opening-hours point as "9:00 AM". */
function formatOpeningPoint(point: {
  hour?: number;
  minute?: number;
  time?: string;
}): string {
  // Google Places API (New): { hour, minute }
  if (point.hour != null) {
    const hours = point.hour;
    const minutes = String(point.minute ?? 0).padStart(2, "0");
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHours}:${minutes} ${period}`;
  }
  // Legacy format: { time: "0900" }
  if (point.time) return formatTimeString(point.time);
  return "";
}

type HourPeriod = {
  open: { day: number; hour?: number; minute?: number; time?: string };
  close?: { day: number; hour?: number; minute?: number; time?: string };
};

/** Each day's hours as printed lines, from either Google shape or a string. */
export const hoursLines = (hours: unknown): string[] => {
  if (typeof hours === "string") return hours === "" ? [] : [hours];
  if (!hours || typeof hours !== "object") return [];
  const h = hours as {
    weekdayDescriptions?: unknown;
    periods?: unknown;
  };
  if (
    Array.isArray(h.weekdayDescriptions) &&
    h.weekdayDescriptions.length > 0
  ) {
    return h.weekdayDescriptions.filter(
      (line): line is string => typeof line === "string",
    );
  }
  if (Array.isArray(h.periods)) {
    const byDay = new Map<number, HourPeriod[]>();
    for (const period of h.periods as HourPeriod[]) {
      const day = period.open.day;
      byDay.set(day, [...(byDay.get(day) ?? []), period]);
    }
    return DAY_NAMES.map((name, day) => {
      const periods = byDay.get(day);
      const text = periods
        ? periods
            .map(
              (p) =>
                `${formatOpeningPoint(p.open)}${p.close ? ` – ${formatOpeningPoint(p.close)}` : ""}`,
            )
            .join(", ")
        : "Closed";
      return `${name}: ${text}`;
    });
  }
  return [];
};

/** A tappable phone / website line. */
function ContactRow({
  icon: Icon,
  href,
  children,
}: {
  icon: typeof Phone;
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target={href.startsWith("tel:") ? undefined : "_blank"}
      rel="noopener noreferrer"
      className="t-body flex min-h-11 items-center gap-3 rounded-sm text-ink outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <Icon
        aria-hidden
        strokeWidth={ICON_STROKE}
        className="size-5 shrink-0 text-glyph"
      />
      <span className="min-w-0 truncate">{children}</span>
    </a>
  );
}

const websiteHref = (website: string): string =>
  /^https?:\/\//.test(website) ? website : `https://${website}`;

/**
 * Info: hours, then Call and Web only when the place has them (Places-Place
 * ruling 3). Nothing at all when there is nothing to say.
 */
export function PlaceInfoCard({
  hours,
  phone,
  website,
}: {
  hours: unknown;
  phone: string | null | undefined;
  website: string | null | undefined;
}) {
  const lines = hoursLines(hours);
  if (lines.length === 0 && !phone && !website) return null;
  return (
    <PlaceCard label="Info" data-slot="place-info">
      {lines.length > 0 && (
        <div className="flex gap-3">
          <Schedule
            aria-hidden
            strokeWidth={ICON_STROKE}
            className="mt-0.5 size-5 shrink-0 text-glyph"
          />
          <ul className="flex flex-col gap-1">
            {lines.map((line) => (
              <li key={line} className="t-body tabular text-ink">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
      {phone && (
        <ContactRow icon={Phone} href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
          {phone}
        </ContactRow>
      )}
      {website && (
        <ContactRow icon={Public} href={websiteHref(website)}>
          {website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
        </ContactRow>
      )}
    </PlaceCard>
  );
}
