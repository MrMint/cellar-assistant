import type { ReactNode } from "react";
import { Link } from "@/components/app/Link";
import { BAND_LABELS } from "@/components/tier-list/constants";
import { cn } from "@/lib/utils";
import { HeldBackNote } from "./HeldBackNote";

export type ItemTierListEntry = {
  id: string;
  band: number;
  tier_list: { id: string; name: string } | null;
};

/**
 * The tier-band ramp (design §3.1): claret → brass for 5 … 1, Unrated on
 * `surface-3`. The band word is always printed beside the hue, in the ink
 * that reads on that fill at 4.5:1 — parchment (`ink-1`) on the dark bands,
 * the page's near-black (`background`) on the two light ones, where
 * parchment is only 3.1 and 3.6:1 (`item-tier-bands.test.ts`). Written out
 * in full so Tailwind sees every class.
 */
export const BAND_INK = {
  5: "onBand",
  4: "onBand",
  3: "onBand",
  2: "onBand",
  1: "onBand",
} as const satisfies Record<1 | 2 | 3 | 4 | 5, "onBand">;

export const BAND_CLASS: Record<number, string> = {
  5: "bg-band-5 text-on-band",
  4: "bg-band-4 text-on-band",
  3: "bg-band-3 text-on-band",
  2: "bg-band-2 text-on-band",
  1: "bg-band-1 text-on-band",
  0: "bg-raised text-ink-2",
};

/**
 * `82450ad1:src/components/item/ItemTierLists.tsx`, restored.
 *
 * The old component ran its own server query over `tier_list_items` with an
 * `_or` of seven nil-uuid filters and showed every list it found — private
 * ones included (§7). It now takes `Item.tierListEntries` (G8) as a prop, which
 * the API has already reduced to lists the viewer may see; a list that stopped
 * being visible between the two reads arrives with a null `tierList`, which
 * renders as the old "Unknown list".
 */
export function ItemTierLists({
  entries,
  total,
  add,
}: {
  entries: ItemTierListEntry[];
  /** `tierListEntries.totalCount`, when the API held rows back. */
  total?: number | null;
  /** "Add to a list", shown beside "Not ranked" (the item page's). */
  add?: ReactNode;
}) {
  // CROSS-LOT "On your lists": the Social-Lists "Your rank" block, which
  // matches the place page — "Not ranked" with Add to a list, else each list
  // with its band (the filled band colour and its name, never gold).
  return (
    <section
      data-testid="your-rank"
      aria-labelledby="your-rank-label"
      className="flex flex-col gap-2"
    >
      <h2 id="your-rank-label" className="t-cap text-ink-2">
        Your rank
      </h2>
      {entries.length === 0 ? (
        <div className="flex min-h-11 items-center justify-between gap-3">
          <span className="t-head text-ink">Not ranked</span>
          {add}
        </div>
      ) : (
        <ul className="flex flex-col">
          {entries.map((item) => (
            <li
              key={item.id}
              className="flex min-h-11 items-center justify-between gap-3"
            >
              {item.tier_list ? (
                <Link
                  href={`/tier-lists/${item.tier_list.id}`}
                  underline="none"
                  className="t-head block min-w-0 truncate py-3 text-ink"
                >
                  {item.tier_list.name}
                </Link>
              ) : (
                <span className="t-head text-ink">Unknown list</span>
              )}
              <span
                className={cn(
                  "t-cap inline-flex h-6 shrink-0 items-center rounded-sm px-2 ring-1 ring-band-edge ring-inset",
                  BAND_CLASS[item.band] ?? BAND_CLASS[0],
                )}
              >
                {BAND_LABELS[item.band] ?? `Band ${item.band}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <HeldBackNote shown={entries.length} total={total} noun="lists" />
    </section>
  );
}
