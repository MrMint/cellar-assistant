"use client";

import { VesselSilhouette } from "@/components/app/LabelPlate";
import { Link } from "@/components/app/Link";
import { itemTypeTokens } from "@/components/app/TypeChip";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { cn } from "@/lib/utils";

type ItemType = "Beer" | "Wine" | "Spirit" | "Coffee" | "Sake" | "Tea";

/** Each card's plate type (H-3, L22: its vessel on its tint, no raster). */
const PLATE_TYPE: Readonly<Record<ItemType, ApiItemType>> = {
  Beer: "BEER",
  Wine: "WINE",
  Spirit: "SPIRIT",
  Coffee: "COFFEE",
  Sake: "SAKE",
  Tea: "TEA",
};

type AddItemTypeCardProps = {
  type: ItemType;
  /** Absent: shown, not linked (no permission). */
  href?: string;
};

const AddItemTypeCard = ({ type, href }: AddItemTypeCardProps) => (
  <div
    data-slot="add-item-type-card"
    className={cn(
      "relative flex min-w-0 flex-col overflow-hidden rounded-lg bg-surface-1",
      href !== undefined &&
        "transition-[background-color,transform] duration-(--ca-dur-micro) ease-standard hover:bg-surface-2 has-[a:active]:scale-97 motion-reduce:has-[a:active]:scale-100",
    )}
  >
    {/* Decorative: the card's name says the type. */}
    <div
      data-slot="type-plate"
      data-type={PLATE_TYPE[type]}
      className={cn(
        "relative flex aspect-square items-center justify-center",
        itemTypeTokens[PLATE_TYPE[type]].tintClass,
        itemTypeTokens[PLATE_TYPE[type]].textClass,
      )}
    >
      <VesselSilhouette type={PLATE_TYPE[type]} className="h-3/5 w-auto" />
    </div>
    <div className="flex p-4">
      {href === undefined ? (
        <span className="type-headline grow text-center text-ink-1">
          {type}
        </span>
      ) : (
        <Link overlay underline="none" href={href} className="grow">
          <span className="type-headline block text-center text-ink-1">
            {type}
          </span>
        </Link>
      )}
    </div>
  </div>
);

interface AddItemClientProps {
  cellarId?: string;
  /** The cellar's name, for the heading; the server page reads it. */
  cellarName?: string;
  /** Creator or co-owner. Ignored without a cellar (`/add`). */
  canAdd?: boolean;
}

/**
 * `82450ad1:src/components/cellar/AddItemClient.tsx`, restored: the heading,
 * the permission note, and six type cards in the old order linking to the
 * onboarding routes (`/cellars/<id>/<type>s/add`, or `/add/<type>s`).
 *
 * The old component read the cellar's name and owners with a client query;
 * the server page now passes them. One fix (§7): without permission the cards
 * no longer link — the old ones led into a flow whose save could only fail.
 */
export function AddItemClient({
  cellarId,
  cellarName,
  canAdd: canAddProp = true,
}: AddItemClientProps) {
  const canAdd = !cellarId || canAddProp;

  return (
    <div className="flex flex-col gap-8">
      <h2 className="type-title-1 text-ink-1">
        {cellarId ? `Add an item to ${cellarName}` : "Add an item"}
      </h2>
      {cellarId && !canAdd && (
        <p className="type-body">
          You do not have permission to add items to this cellar.{" "}
          {/* The cards are inert here, so this is the page's one control —
              and axe's scrollable-region-focusable needs one in <main>. */}
          <Link href={`/cellars/${cellarId}/items`} underline="always">
            Back to {cellarName ?? "the cellar"}
          </Link>
        </p>
      )}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {(
          [
            "Wine",
            "Beer",
            "Spirit",
            "Coffee",
            "Sake",
            "Tea",
          ] satisfies ItemType[]
        ).map((x) => (
          <AddItemTypeCard
            key={x}
            type={x}
            href={
              !canAdd
                ? undefined
                : cellarId
                  ? `/cellars/${cellarId}/${x.toLowerCase()}s/add`
                  : `/add/${x.toLowerCase()}s`
            }
          />
        ))}
      </div>
    </div>
  );
}
