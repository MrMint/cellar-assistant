import { Score } from "@/components/app/Score";
import { TypeChip, TypeGlyph } from "@/components/app/TypeChip";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
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

/**
 * An item's public page (X17): the photo (or the type's plate), its name and
 * facts, everyone's score, its own description. What a friend sees before
 * they have an account — and nothing a stranger with one would not.
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
      <div className="relative mx-auto flex aspect-[4/5] w-full max-w-[360px] items-center justify-center overflow-hidden rounded-lg bg-surface-1">
        {imageUrl !== null ? (
          // biome-ignore lint/performance/noImgElement: a presigned file URL that expires; the optimiser would cache it under a key that stops working.
          <img
            src={imageUrl}
            alt={title}
            className="absolute inset-0 size-full object-contain"
          />
        ) : (
          <TypeGlyph type={type} className="size-20 opacity-80" />
        )}
      </div>

      <header className="flex flex-col gap-2">
        <TypeChip type={type} />
        <h1 className="type-large-title break-words font-display text-ink-1">
          {title}
        </h1>
        {subtitle !== "" && (
          <p className="type-callout text-ink-2">{subtitle}</p>
        )}
      </header>

      {scoreAverage !== null && scoreCount > 0 ? (
        <div className="flex items-baseline gap-3 rounded-lg bg-surface-1 px-4 py-3">
          <Score value={scoreAverage} variant="hero" />
          <p className="type-callout text-ink-2">
            from {scoreCount} {scoreCount === 1 ? "rating" : "ratings"} on
            Cellar Assistant
          </p>
        </div>
      ) : null}

      {description !== null && description.trim() !== "" && (
        <p className="type-body whitespace-pre-line text-ink-2">
          {description}
        </p>
      )}

      {characteristics.length > 0 && (
        <dl className="grid grid-cols-2 gap-2">
          {characteristics.map((row) => (
            <div
              key={row.label}
              className="flex flex-col rounded-md bg-surface-1 px-3 py-2"
            >
              <dt className="type-footnote">{row.label}</dt>
              <dd className="type-body text-ink-1">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
