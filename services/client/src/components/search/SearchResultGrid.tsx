import { itemHref } from "@/components/item-api/itemTypes";
import type { SearchResultItem } from "./adapter";
import { ResultRow } from "./sections/ResultRow";
import type { SearchRow } from "./universal-search";

interface SearchResultGridProps {
  items: SearchResultItem[];
}

/** A barcode's or a photo's match as a search row (the same card as text). */
export const rowFromResult = (item: SearchResultItem): SearchRow => ({
  key: `${item.type}:${item.id}`,
  title: item.vintage ? `${item.name} ${item.vintage}` : item.name,
  ...(item.subtitle ? { description: item.subtitle } : {}),
  href: itemHref(item.type, item.id),
  thumb:
    item.displayImageUrl !== undefined
      ? { kind: "image", url: item.displayImageUrl }
      : { kind: "item", itemType: item.type },
  score: item.score ?? null,
});

/**
 * A photo's or a barcode's matches (Recipes-Search 44): the same row cards
 * as a text search's sections, one column on a phone, three from `xl`.
 */
export function SearchResultGrid({ items }: SearchResultGridProps) {
  if (items.length === 0) {
    return (
      <p className="t-cap py-6 text-center text-ink-2">No results found</p>
    );
  }
  return (
    <ul
      data-search-results
      className="m-0 grid list-none gap-2 p-0 md:grid-cols-2 xl:grid-cols-3"
    >
      {items.map((item) => (
        <li key={`${item.type}:${item.id}`}>
          <ResultRow row={rowFromResult(item)} />
        </li>
      ))}
    </ul>
  );
}
