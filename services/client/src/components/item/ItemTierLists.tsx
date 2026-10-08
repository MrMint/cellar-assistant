import { Ranked } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { BAND_LABELS } from "@/components/tier-list/constants";
import { cn } from "@/lib/utils";
import { HeldBackNote } from "./HeldBackNote";
import { ItemSection } from "./ItemSection";

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
  5: "ink1",
  4: "ink1",
  3: "bg",
  2: "bg",
  1: "ink1",
} as const satisfies Record<1 | 2 | 3 | 4 | 5, "ink1" | "bg">;

export const BAND_CLASS: Record<number, string> = {
  5: "bg-band-5 text-ink-1",
  4: "bg-band-4 text-ink-1",
  3: "bg-band-3 text-background",
  2: "bg-band-2 text-background",
  1: "bg-band-1 text-ink-1",
  0: "bg-surface-3 text-ink-2",
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
}: {
  entries: ItemTierListEntry[];
  /** `tierListEntries.totalCount`, when the API held rows back. */
  total?: number | null;
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <ItemSection
      title="On Lists"
      icon={<Ranked aria-hidden className="size-5 text-ink-2" />}
    >
      <ul className="flex flex-col gap-2">
        {entries.map((item) => (
          <li
            key={item.id}
            className="flex min-h-11 items-center justify-between gap-2"
          >
            {item.tier_list ? (
              <Link
                href={`/tier-lists/${item.tier_list.id}`}
                className="type-callout min-w-0 truncate font-semibold text-ink-1"
              >
                {item.tier_list.name}
              </Link>
            ) : (
              <span className="type-callout font-semibold text-ink-1">
                Unknown list
              </span>
            )}
            <span
              className={cn(
                "inline-flex h-6 shrink-0 items-center rounded-full px-2.5 font-medium text-xs",
                BAND_CLASS[item.band] ?? BAND_CLASS[0],
              )}
            >
              {BAND_LABELS[item.band] ?? `Band ${item.band}`}
            </span>
          </li>
        ))}
      </ul>
      <HeldBackNote shown={entries.length} total={total} noun="lists" />
    </ItemSection>
  );
}
