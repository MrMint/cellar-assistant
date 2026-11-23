"use client";

import { useEffect, useState } from "react";
import { useQuery } from "urql";
import { Place, Scan } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { useGeolocation } from "@/components/map/hooks/useGeolocation";
import { cn } from "@/lib/utils";
import type { ItemView } from "./adapter";
import { ItemSection } from "./ItemSection";
import {
  ItemSeenAtQuery,
  SCAN_A_MENU_HREF,
  type SeenAtRow,
  seenAtDistance,
  seenAtRows,
  seenAtWhy,
} from "./seen-at";

/**
 * "Seen at" (L10, board SeenAt): the places this item was seen on a scanned
 * menu or logged, as far as the viewer may see them — the server leaves out
 * every place and log they may not (`ItemActor.seenAt`).
 *
 * A slot (L38): it fetches through urql after mount and renders nothing until
 * it has at least one place, so `ItemPageView` stays synchronous and a
 * static render is empty. It never asks for location: the item page is not a
 * place to raise the OS prompt (D14 asks on demand). When the browser already
 * shares a position the list is nearest first with distances; otherwise
 * newest first.
 */
export function SeenAtSection({ item }: { item: ItemView }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  // Nothing before mount: no urql on a static render, and no relative time
  // to mismatch on hydration.
  if (now === null) return null;
  return <SeenAtList item={item} now={now} />;
}

function SeenAtList({ item, now }: { item: ItemView; now: number }) {
  const geo = useGeolocation();
  const near =
    geo.location === null
      ? null
      : { lat: geo.location.latitude, lng: geo.location.longitude };
  const [{ data }] = useQuery({
    query: ItemSeenAtQuery,
    variables: { id: item.itemId, type: item.type, near },
    // After mount, and once the position question has settled, so a granted
    // position does not fetch twice.
    pause: geo.loading && geo.permission === "granted",
  });
  const rows = seenAtRows(data);
  if (rows.length === 0) return null;

  return (
    <div data-slot="seen-at" className="flex min-w-0 flex-col gap-3">
      <ItemSection title="Seen at">
        <ul className="-my-1 flex flex-col">
          {rows.map((row) => (
            <SeenAtItem key={row.place.id} row={row} now={now} />
          ))}
        </ul>
        <p className="type-footnote text-ink-3">
          From menus scanned on shared places, your own logs, and friends' logs
          they share with you.{near === null ? "" : " Nearest first."}
        </p>
      </ItemSection>
      <section
        aria-label="Saw it somewhere else?"
        className="flex flex-col gap-1 rounded-lg bg-surface-1 p-4"
      >
        <span className="type-callout text-ink-1">Saw it somewhere else?</span>
        <span className="type-footnote text-ink-3">
          Scan the menu and it shows up here for you and your friends.
        </span>
        <Link
          href={SCAN_A_MENU_HREF}
          className="type-callout mt-1 inline-flex min-h-11 items-center self-start font-medium text-brand"
        >
          Scan a menu
        </Link>
      </section>
    </div>
  );
}

function SeenAtItem({ row, now }: { row: SeenAtRow; now: number }) {
  const distance = seenAtDistance(row.distanceMeters ?? null);
  const menu = row.kind === "MENU";
  return (
    <li>
      <Link
        href={`/places/${row.place.id}`}
        className="flex min-h-14 items-center gap-3 rounded-md py-1 text-ink-1"
      >
        <span
          aria-hidden
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-md",
            menu ? "bg-primary/25" : "bg-surface-3",
          )}
        >
          {menu ? (
            <Scan className="size-[18px]" />
          ) : (
            <Place className="size-[18px]" />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="type-body truncate">{row.placeName}</span>
          <span className="type-footnote truncate text-ink-3">
            {seenAtWhy(row, now)}
          </span>
        </span>
        {distance === null ? null : (
          <span className="type-footnote shrink-0 text-ink-3 tabular-nums">
            {distance}
          </span>
        )}
      </Link>
    </li>
  );
}
