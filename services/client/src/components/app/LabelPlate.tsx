import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import {
  type LabelPlateData,
  plateFootLine,
  plateSummary,
} from "@/lib/items/label-plate";
import { cn } from "@/lib/utils";
import {
  type PlateStyleFields,
  VESSEL_PATHS,
  vesselFor,
} from "./label-plate/silhouettes";
import { itemTypeTokens } from "./TypeChip";

export type { LabelPlateData } from "@/lib/items/label-plate";
export type { PlateStyleFields } from "./label-plate/silhouettes";

/**
 * The plate's tint: the type hue at 18% over surface-2 (the Main board, B03).
 * Literal class names, so Tailwind sees each one.
 */
const PLATE_TINT: Readonly<Record<ApiItemType, string>> = {
  WINE: "bg-type-wine/18",
  BEER: "bg-type-beer/18",
  SPIRIT: "bg-type-spirit/18",
  SAKE: "bg-type-sake/18",
  COFFEE: "bg-type-coffee/18",
  TEA: "bg-type-tea/18",
};

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
   * B03: the item's style fields, which pick its vessel (a Burgundy bottle
   * for a pinot noir, a can for an IPA). Optional: without them the plate
   * draws its type's vessel, as it always has.
   */
  styleFields?: PlateStyleFields | null;
  className?: string;
};

/**
 * LabelPlate v0 (design §3.5, N28): what an item looks like when nobody has
 * photographed it. A deterministic plate — zero AI, zero network — on the
 * type's tint (18%, B03), shaded top to bottom with a faint paper grain, the type's
 * vessel (its style's, B03) behind it at 16%, and an inner paper rect holding the producer in
 * Fraunces small caps, the name, a big Fraunces vintage and region · ABV.
 *
 * It fills its container, whatever its shape: the caller sets the aspect
 * (`aspect-3/4` on a BottleCard, the card's own on an ItemCard, square on a
 * detail hero). Type sizes are container-relative (`cqw`, clamped), so the
 * same plate reads at 170 px in a phone grid and at 360 px as a hero.
 *
 * The text is HTML over an SVG silhouette rather than SVG `<text>`: it wraps,
 * clamps and ellipsises, and it is set in the app's loaded fonts.
 */
export function LabelPlate({
  type,
  plate,
  labelled = false,
  muted = false,
  styleFields,
  className,
}: LabelPlateProps) {
  const token = itemTypeTokens[type];
  const foot = plateFootLine(plate);
  return (
    <div
      data-slot="label-plate"
      data-type={type}
      {...(labelled
        ? { role: "img", "aria-label": `Label: ${plateSummary(plate)}` }
        : { "aria-hidden": true })}
      className={cn(
        "@container relative isolate size-full overflow-hidden bg-surface-2",
        muted && "opacity-55 grayscale-[35%]",
        className,
      )}
    >
      <div className={cn("absolute inset-0", PLATE_TINT[type])} />
      <div className="absolute inset-0 bg-linear-to-b from-white/5 via-transparent to-black/30" />
      <div className="plate-grain absolute inset-0 opacity-60 mix-blend-overlay" />
      <VesselSilhouette
        type={type}
        styleFields={styleFields}
        className={cn(
          "absolute top-[4%] left-1/2 h-[92%] w-auto -translate-x-1/2 opacity-16",
          token.textClass,
        )}
      />
      <div
        data-slot="label-plate-paper"
        className="absolute inset-[7%] flex flex-col items-center justify-center gap-[2.5cqw] overflow-hidden rounded-[3px] px-[6cqw] text-center ring-1 ring-ink-1/12 ring-inset"
      >
        {plate.producer !== undefined && (
          <p
            data-slot="label-plate-producer"
            className="line-clamp-1 font-display text-[length:clamp(10px,7.5cqw,20px)] text-ink-2 leading-tight tracking-[0.06em] [font-variant-caps:all-small-caps]"
          >
            {plate.producer}
          </p>
        )}
        <p
          data-slot="label-plate-name"
          className="line-clamp-2 break-words font-semibold text-[length:clamp(12px,8.5cqw,24px)] text-ink-1 leading-[1.15]"
        >
          {plate.name}
        </p>
        {plate.vintage !== undefined && (
          <>
            <span
              aria-hidden
              className={cn(
                "h-px w-[18cqw] bg-current opacity-50",
                token.textClass,
              )}
            />
            <p
              data-slot="label-plate-vintage"
              className={cn(
                "tabular font-display font-medium text-[length:clamp(22px,21cqw,72px)] leading-none [font-variation-settings:'SOFT'_50]",
                token.textClass,
              )}
            >
              {plate.vintage}
            </p>
          </>
        )}
        {foot !== undefined && (
          <p
            data-slot="label-plate-foot"
            className="tabular line-clamp-1 text-[length:clamp(9px,6cqw,15px)] text-ink-3 leading-tight"
          >
            {foot}
          </p>
        )}
      </div>
    </div>
  );
}
