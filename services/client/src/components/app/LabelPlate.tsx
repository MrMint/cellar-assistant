import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { type LabelPlateData, plateSummary } from "@/lib/items/label-plate";
import { cn } from "@/lib/utils";
import {
  type PlateStyleFields,
  VESSEL_PATHS,
  vesselFor,
} from "./label-plate/silhouettes";
import { TumblerGlyph } from "./parts/glyphs";
import { itemTypeTokens } from "./TypeChip";

export type { LabelPlateData } from "@/lib/items/label-plate";
export type { PlateStyleFields } from "./label-plate/silhouettes";

/**
 * One vessel's outline, on the 64 × 160 grid — for drawing *inside* the
 * silhouette (the Pour sheet's liquid is clipped to it, X03). With style
 * fields it is the style's vessel (B03's table, `label-plate/silhouettes`);
 * without, the type's.
 */
export const vesselShape = (
  type: ApiItemType,
  styleFields?: PlateStyleFields | null,
): { readonly name: string; readonly d: string; readonly evenOdd: boolean } => {
  const name = vesselFor(type, styleFields);
  const vessel = VESSEL_PATHS[name];
  return { name, d: vessel.d, evenOdd: vessel.evenOdd === true };
};

/** The silhouette alone — for a plate, or a future empty state. */
export function VesselSilhouette({
  type,
  styleFields,
  className,
}: {
  type: ApiItemType;
  styleFields?: PlateStyleFields | null;
  className?: string;
}) {
  const vessel = vesselShape(type, styleFields);
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 64 160"
      data-slot="vessel"
      data-vessel={vessel.name}
      className={cn("fill-current", className)}
    >
      <path d={vessel.d} fillRule={vessel.evenOdd ? "evenodd" : undefined} />
    </svg>
  );
}

export type LabelPlateProps = {
  type: ApiItemType;
  plate: LabelPlateData;
  /**
   * Decorative by default: on a card the title link already names the item,
   * so the plate is hidden from assistive tech. `labelled` makes it an image
   * named by its own text, for a page where it stands in for the photo.
   */
  labelled?: boolean;
  /** Dim it (a finished bottle). */
  muted?: boolean;
  /**
   * Kept for callers (B03): the plate no longer draws a vessel, but
   * `VesselSilhouette` and `vesselShape` still take these fields.
   */
  styleFields?: PlateStyleFields | null;
  /**
   * `recipe`: the recipe face, a tumbler glyph over the recipe's name
   * (amendments, "Recipe face"). Default: the drink's kind glyph.
   */
  face?: "drink" | "recipe";
  className?: string;
};

/**
 * The no-photo plate (KIT amendments, "No-photo plate"): what a drink looks
 * like when nobody has photographed it. It fills its container on the raised
 * well, with no border, and reads its own width (a container query):
 *
 * - 75 px and up: a drawn label, a card-coloured r8 plate (52 % × 58 %)
 *   holding the kind glyph and the drink's name;
 * - under 75 px: just the kind glyph, at 50 % of the plate.
 *
 * The well's own corners are the caller's (r4 on a small thumb, the tile's
 * r8 clip on a tile). Deterministic: zero AI, zero network.
 */
export function LabelPlate({
  type,
  plate,
  labelled = false,
  muted = false,
  face = "drink",
  styleFields,
  className,
}: LabelPlateProps) {
  const Glyph = face === "recipe" ? TumblerGlyph : itemTypeTokens[type].glyph;
  return (
    <div
      data-slot="label-plate"
      data-type={type}
      data-face={face}
      data-vessel={vesselFor(type, styleFields)}
      {...(labelled
        ? { role: "img", "aria-label": `Label: ${plateSummary(plate)}` }
        : { "aria-hidden": true })}
      className={cn(
        "@container relative isolate size-full overflow-hidden bg-raised",
        muted && "opacity-55 grayscale-[35%]",
        className,
      )}
    >
      {/* Under 75 px: the kind glyph alone, half the plate. */}
      <div className="absolute inset-0 flex items-center justify-center @min-[75px]:hidden">
        <Glyph aria-hidden strokeWidth={1.25} className="size-1/2 text-glyph" />
      </div>
      {/* 75 px and up: the drawn label. */}
      <div className="absolute inset-0 hidden items-center justify-center @min-[75px]:flex">
        <div
          data-slot="label-plate-paper"
          className="flex h-[58%] w-[52%] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-md bg-card px-3 text-center"
        >
          <Glyph
            aria-hidden
            strokeWidth={1.25}
            className="aspect-square h-auto w-[34%] shrink-0 text-glyph"
          />
          {plate.producer !== undefined && plate.producer !== "" && (
            <p
              data-slot="label-plate-producer"
              className="m-0 line-clamp-1 break-words text-[length:clamp(9px,4.5cqw,12px)] text-ink-2 leading-[1.2]"
            >
              {plate.producer}
            </p>
          )}
          <p
            data-slot="label-plate-name"
            className="m-0 line-clamp-3 break-words font-semibold text-[length:clamp(11px,6cqw,16px)] text-ink leading-[1.2]"
          >
            {plate.name}
          </p>
          {plate.vintage !== undefined && plate.vintage !== "" && (
            <p
              data-slot="label-plate-vintage"
              className="tabular m-0 text-[length:clamp(9px,4.5cqw,12px)] text-ink-2 leading-[1.2]"
            >
              {plate.vintage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
