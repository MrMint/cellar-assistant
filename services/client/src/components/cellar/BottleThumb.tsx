import Image from "next/image";
import { LabelPlate } from "@/components/app/LabelPlate";
import { itemTypeTokens } from "@/components/app/TypeChip";
import { cn } from "@/lib/utils";
import { getNextPlaceholder } from "@/utilities";
import type { CellarGridItem } from "./adapter";

/**
 * A bottle at row size (X04: the Finished diary, "In your other cellars"):
 * its photo, else its LabelPlate, in a 3:4 frame on the type's tint.
 * Decorative — the row's title names the bottle.
 */
export function BottleThumb({
  cell,
  className,
}: {
  cell: CellarGridItem;
  /** Width; the frame keeps 3:4. */
  className?: string;
}) {
  const { item, type } = cell;
  return (
    <div
      aria-hidden
      className={cn(
        "relative aspect-3/4 w-12 shrink-0 overflow-hidden rounded-sm",
        itemTypeTokens[type].tintClass,
        className,
      )}
    >
      {item.displayImageUrl !== undefined ? (
        <Image
          src={item.displayImageUrl}
          alt=""
          fill
          sizes="48px"
          placeholder={getNextPlaceholder(item.placeholder)}
          className="object-cover"
        />
      ) : (
        <LabelPlate type={type} plate={item.plate ?? { name: item.name }} />
      )}
    </div>
  );
}
