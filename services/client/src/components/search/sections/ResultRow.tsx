import Image from "next/image";
import { Place, Store } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { TumblerGlyph } from "@/components/app/parts/glyphs";
import { formatKitScore, Stars } from "@/components/app/parts/Stars";
import { itemTypeTokens, TypeGlyph } from "@/components/app/TypeChip";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import type { RowThumb, SearchRow } from "../universal-search";

const isItemType = (value: string): value is ApiItemType =>
  value in itemTypeTokens;

/**
 * The row's plate (54 wide, the row's height): the photo, or the kit's
 * no-photo face — the kind glyph on the raised well, no border.
 */
function Plate({ thumb }: { thumb: RowThumb }) {
  const well =
    "relative flex w-[54px] shrink-0 items-center justify-center self-stretch overflow-hidden bg-raised";
  switch (thumb.kind) {
    case "image":
      return (
        <span className={well}>
          <Image
            src={thumb.url}
            alt=""
            fill
            sizes="54px"
            className="object-cover"
          />
        </span>
      );
    case "external":
      return (
        <span className={well}>
          {/* biome-ignore lint/performance/noImgElement: a free-form URL; next/image would need its host allowlisted. */}
          <img src={thumb.url} alt="" className="size-full object-cover" />
        </span>
      );
    case "item":
      return (
        <span className={well}>
          {isItemType(thumb.itemType) && (
            <TypeGlyph type={thumb.itemType} className="size-6 text-glyph" />
          )}
        </span>
      );
    case "icon":
      return (
        <span className={well}>
          {thumb.icon === "recipe" ? (
            <TumblerGlyph aria-hidden className="size-6 text-glyph" />
          ) : thumb.icon === "brand" ? (
            <Store
              aria-hidden
              strokeWidth={1.25}
              className="size-6 text-glyph"
            />
          ) : (
            <Place
              aria-hidden
              strokeWidth={1.25}
              className="size-6 text-glyph"
            />
          )}
        </span>
      );
    case "avatar":
      return <span className={well} />;
  }
}

/**
 * One result (Recipes-Search 08): a card with its plate, the name, the
 * maker or kind line, and a line of stars when it has a score. The whole
 * card is the link; press .97.
 */
export function ResultRow({ row }: { row: SearchRow }) {
  return (
    <div
      data-search-row={row.key}
      className="relative flex min-h-14 overflow-hidden rounded-md border border-edge bg-card transition-transform duration-(--ca-dur-micro) ease-standard has-[a[data-slot=link]:active]:scale-97 motion-reduce:has-[a[data-slot=link]:active]:scale-100"
    >
      <Plate thumb={row.thumb} />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-px px-2.5 py-1.5">
        <span className="t-head line-clamp-2 text-ink">
          {row.href === undefined ? (
            row.title
          ) : (
            <Link href={row.href} overlay underline="none" className="text-ink">
              {row.title}
            </Link>
          )}
        </span>
        {row.description !== undefined && (
          <span className="t-cap truncate text-ink-2">{row.description}</span>
        )}
        {row.score != null && (
          <span className="flex items-center gap-1.5">
            <Stars value={row.score} size="sm" />
            <span className="t-cap tabular text-ink">
              {formatKitScore(row.score)}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
