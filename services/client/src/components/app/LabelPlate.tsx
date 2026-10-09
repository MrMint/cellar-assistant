import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import {
  type LabelPlateData,
  plateFootLine,
  plateSummary,
} from "@/lib/items/label-plate";
import { cn } from "@/lib/utils";
import { itemTypeTokens } from "./TypeChip";

export type { LabelPlateData } from "@/lib/items/label-plate";

/**
 * One vessel silhouette per type (N28's six; B03 grows this to ~15 chosen by
 * style). Drawn on a 64 × 160 grid, filled with `currentColor`, so the plate
 * tints them; the coffee bag's valve is a hole (`evenodd`).
 */
const VESSELS: Readonly<
  Record<ApiItemType, { name: string; d: string; evenOdd?: boolean }>
> = {
  // A Bordeaux bottle: straight neck, high shoulders.
  WINE: {
    name: "bordeaux",
    d: "M27 4H37V8H36V48C36 56 50 58 50 72V152Q50 156 46 156H18Q14 156 14 152V72C14 58 28 56 28 48V8H27Z",
  },
  // A tall-neck beer bottle: long neck, long sloping shoulder.
  BEER: {
    name: "tall-neck",
    d: "M28 4H36V9H35V40C35 52 47 60 47 78V152Q47 156 43 156H21Q17 156 17 152V78C17 60 29 52 29 40V9H28Z",
  },
  // A decanter with its stopper — not a cocktail glass (visual-7).
  SPIRIT: {
    name: "decanter",
    d: "M25 4H39Q41 4 41 6V14Q41 16 39 16H25Q23 16 23 14V6Q23 4 25 4ZM28 18H36V26C36 30 56 32 56 42V148Q56 156 48 156H16Q8 156 8 148V42C8 32 28 30 28 26Z",
  },
  // A tokkuri: flared lip, narrow neck, a full belly — not a tumbler.
  SAKE: {
    name: "tokkuri",
    d: "M22 4H42Q42 8 37 12V30C37 44 56 62 56 104C56 140 46 156 32 156C18 156 8 140 8 104C8 62 27 44 27 30V12Q22 8 22 4Z",
  },
  // A coffee bag: the crimped seal, then the bag with its one-way valve.
  COFFEE: {
    name: "bag",
    d: "M12 6H52V18H12ZM10 22H54L52 150Q52 156 46 156H18Q12 156 12 150ZM26 58A6 6 0 1 0 38 58A6 6 0 1 0 26 58Z",
    evenOdd: true,
  },
  // A tea tin: knob, lid, can.
  TEA: {
    name: "tin",
    d: "M27 6H37V14H27ZM12 14H52Q54 14 54 16V30H10V16Q10 14 12 14ZM13 33H51V150Q51 156 45 156H19Q13 156 13 150Z",
  },
};

/**
 * One type's vessel outline, on the 64 × 160 grid — for drawing *inside* the
 * silhouette (the Pour sheet's liquid is clipped to it, X03).
 */
export const vesselShape = (
  type: ApiItemType,
): { readonly name: string; readonly d: string; readonly evenOdd: boolean } => {
  const vessel = VESSELS[type];
  return { name: vessel.name, d: vessel.d, evenOdd: vessel.evenOdd === true };
};

/** The silhouette alone — for a plate, or a future empty state. */
export function VesselSilhouette({
  type,
  className,
}: {
  type: ApiItemType;
  className?: string;
}) {
  const vessel = VESSELS[type];
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
  className?: string;
};

/**
 * LabelPlate v0 (design §3.5, N28): what an item looks like when nobody has
 * photographed it. A deterministic plate — zero AI, zero network — on the
 * type's tint, shaded top to bottom with a faint paper grain, the type's
 * vessel behind it at 12%, and an inner paper rect holding the producer in
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
      <div className={cn("absolute inset-0", token.tintClass)} />
      <div className="absolute inset-0 bg-linear-to-b from-white/5 via-transparent to-black/30" />
      <div className="plate-grain absolute inset-0 opacity-60 mix-blend-overlay" />
      <VesselSilhouette
        type={type}
        className={cn(
          "absolute top-[4%] left-1/2 h-[92%] w-auto -translate-x-1/2 opacity-12",
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
