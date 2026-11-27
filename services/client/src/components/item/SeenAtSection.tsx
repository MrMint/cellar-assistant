"use client";

import { useEffect, useState } from "react";
import { useQuery } from "urql";
import { Place, Scan } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { onDrinkLogChanged } from "@/components/drink-log/log-events";
import { useGeolocation } from "@/components/map/hooks/useGeolocation";
import { isOffered, useAiCapabilities } from "@/lib/ai/capabilities";
import { cn } from "@/lib/utils";
import type { ItemView } from "./adapter";
import { ItemSection } from "./ItemSection";
import {
  ItemSeenAtQuery,
  SCAN_A_MENU_HREF,
  type SeenAtRow,
  seenAtDistance,
  seenAtRows,
  seenAtView,
  seenAtWhy,
} from "./seen-at";

/**
 * "Seen at" (L10, board SeenAt): the places this item was seen on a scanned
 * menu or logged, as far as the viewer may see them — the server leaves out
 * every place and log they may not (`ItemActor.seenAt`).
 *
 * A slot (L38): it fetches through urql after mount and renders nothing until
 * it has an answer, so `ItemPageView` stays synchronous and a static render
 * is empty. With no places yet it shows the scan prompt alone, where menu
 * scanning is offered (W-15, `seenAtView`). A drink log written from anywhere
 * re-asks (W-14, `drink-log/log-events.ts`): a log with a place shows here
 * without a reload. It never asks for location: the item page is not a
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
  const [{ data }, reexecute] = useQuery({
    query: ItemSeenAtQuery,
    variables: { id: item.itemId, type: item.type, near },
    // After mount, and once the position question has settled, so a granted
    // position does not fetch twice.
    pause: geo.loading && geo.permission === "granted",
  });
  useEffect(
    () =>
      onDrinkLogChanged(item.itemId, () =>
        reexecute({ requestPolicy: "network-only" }),
      ),
    [item.itemId, reexecute],
  );
  const menuScanOffered = isOffered(useAiCapabilities(), "menuScan");
  const view = seenAtView(data, menuScanOffered);
  if (view === "none") return null;
  const rows = seenAtRows(data);

  return (
    <div data-slot="seen-at" className="flex min-w-0 flex-col gap-3">
      {view === "list" ? (
        <ItemSection title="Seen at">
          <ul className="-my-1 flex flex-col">
            {rows.map((row) => (
              <SeenAtItem key={row.place.id} row={row} now={now} />
            ))}
          </ul>
          <p className="t-cap text-ink-3">
            From menus scanned on shared places, your own logs, and friends'
            logs they share with you.{near === null ? "" : " Nearest first."}
          </p>
        </ItemSection>
      ) : (
        // W-15: seen nowhere yet, the section is the prompt — the way into
        // scan-anywhere — and "else" would point at a list that isn't there.
        <ItemSection title="Seen at">
          <ScanPrompt question="Saw it somewhere?" />
        </ItemSection>
      )}
      {view === "list" && <ScanPrompt question="Saw it somewhere else?" />}
    </div>
  );
}

function ScanPrompt({ question }: { question: string }) {
  return (
    <section
      aria-label={question}
      className="flex flex-col gap-1 rounded-lg bg-surface-1 p-4"
    >
      <span className="t-cap text-ink-1">{question}</span>
      <span className="t-cap text-ink-3">
        Scan the menu and it shows up here for you and your friends.
      </span>
      <Link
        href={SCAN_A_MENU_HREF}
        className="t-cap mt-1 inline-flex min-h-11 items-center self-start font-medium text-brand"
      >
        Scan a menu
      </Link>
    </section>
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
          <span className="t-body truncate">{row.placeName}</span>
          <span className="t-cap truncate text-ink-3">
            {seenAtWhy(row, now)}
          </span>
        </span>
        {distance === null ? null : (
          <span className="t-cap shrink-0 text-ink-3 tabular-nums">
            {distance}
          </span>
        )}
      </Link>
    </li>
  );
}
