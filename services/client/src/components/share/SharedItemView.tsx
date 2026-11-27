import { PublicRating } from "@/components/app/parts/Stars";
import { TypeGlyph } from "@/components/app/TypeChip";
import {
  type ApiItemType,
  itemTypeLabel,
} from "@/components/cellar-api/itemTypes";
import {
  type ItemAttributesSource,
  itemCharacteristics,
  itemSubtitlePhrases,
} from "@/components/item/adapter";
import { displayItemName } from "@/utilities/smart-title-case";

export type SharedItemViewProps = {
  type: ApiItemType;
  name: string;
  description: string | null;
  country: string | null;
  /** `SharedItem.attributes`: the type's columns by their own names. */
  attributes: Record<string, unknown>;
  imageUrl: string | null;
  scoreAverage: number | null;
  scoreCount: number;
};

/**
 * `SharedItem.attributes` → the shape `itemSubtitlePhrases` reads: the item
 * fragment aliases `style` per type (`wineStyle`, `beerStyle`,
 * `spiritStyle`), so the shared, unaliased `style` is offered under all three.
 */
export const sharedAttributesSource = (
  attributes: Record<string, unknown>,
): ItemAttributesSource => ({
  ...attributes,
  wineStyle: attributes.style,
  beerStyle: attributes.style,
  spiritStyle: attributes.style,
});

/** The line under the title: "2016 · Cabernet Sauvignon · USA · 13.5%". */
export const sharedItemSubtitle = (
  type: ApiItemType,
  core: { name: string; country: string | null },
  attributes: Record<string, unknown>,
): string =>
  itemSubtitlePhrases(type, core, sharedAttributesSource(attributes))
    .filter((phrase): phrase is string => Boolean(phrase))
    .join(" · ");

const STYLE_ACRONYMS = new Set(["IPA", "APA", "DIPA", "NEIPA", "ESB"]);

/** The style's first segment ("IPA"; an enum value "RED" as "Red"), or "". */
export const sharedItemStyle = (
  attributes: Record<string, unknown>,
): string => {
  if (typeof attributes.style !== "string") return "";
  const first = (attributes.style.split(/\s*[,/]\s*/)[0] ?? "").trim();
  return /^[A-Z]+(_[A-Z]+)*$/.test(first) && !STYLE_ACRONYMS.has(first)
    ? first
        .toLowerCase()
        .split("_")
        .join(" ")
        .replace(/^./, (c) => c.toUpperCase())
    : first;
};

/** "Beer · IPA": the kind, and the style's first segment when it has one. */
export const sharedItemOverline = (
  type: ApiItemType,
  attributes: Record<string, unknown>,
): string =>
  [itemTypeLabel(type), sharedItemStyle(attributes)]
    .filter((part) => part !== "")
    .join(" · ");

/**
 * An item's public page (X17; Social-Lists, signed out): the photo (or the
 * type's plate), the kind, its name and facts, everyone's rating, its own
 * description. What a friend sees before they have an account, and nothing
 * a stranger with one would not.
 */
export function SharedItemView({
  type,
  name,
  description,
  country,
  attributes,
  imageUrl,
  scoreAverage,
  scoreCount,
}: SharedItemViewProps) {
  const title = displayItemName(name);
  const subtitle = sharedItemSubtitle(type, { name, country }, attributes);
  const characteristics = itemCharacteristics(
    type,
    sharedAttributesSource(attributes),
  );

  return (
    <>
      <div className="relative -mx-4 -mt-4 flex h-85 items-center justify-center overflow-hidden bg-raised md:mx-0 md:mt-0 md:rounded-lg">
        {imageUrl !== null ? (
          // biome-ignore lint/performance/noImgElement: a presigned file URL that expires; the optimiser would cache it under a key that stops working.
          <img
            src={imageUrl}
            alt={title}
            className="absolute inset-0 size-full object-contain"
          />
        ) : (
          <span className="flex h-3/4 w-1/2 flex-col items-center justify-center gap-2 rounded-lg border border-edge bg-card p-3 text-center">
            <TypeGlyph type={type} className="size-8 text-glyph" />
            <span className="t-micro line-clamp-3 text-ink-2">{title}</span>
          </span>
        )}
      </div>

      <header className="flex flex-col gap-1 pt-1">
        <p className="t-cap m-0 text-ink-3">
          {sharedItemOverline(type, attributes)}
        </p>
        <h1 className="t-title m-0 break-words text-ink">{title}</h1>
        {subtitle !== "" && (
          <p className="t-cap tabular m-0 text-ink-2">{subtitle}</p>
        )}
      </header>

      {scoreAverage !== null && scoreCount > 0 && (
        <PublicRating value={scoreAverage} count={scoreCount} />
      )}

      {description !== null && description.trim() !== "" && (
        <p className="t-body m-0 whitespace-pre-line text-ink-2">
          {description}
        </p>
      )}

      {characteristics.length > 0 && (
        <dl className="m-0 grid grid-cols-2 gap-2">
          {characteristics.map((row) => (
            <div
              key={row.label}
              className="flex flex-col rounded-md border border-edge bg-card px-3 py-2"
            >
              <dt className="t-cap text-ink-3">{row.label}</dt>
              <dd className="t-body m-0 text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
