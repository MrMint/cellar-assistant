import { ImageResponse } from "next/og";
import { itemTypeLabel } from "@/components/cellar-api/itemTypes";
import { loadSharedItem } from "@/components/share/loaders";
import {
  BrandCard,
  ItemCard,
  inlineImage,
  OG_SIZE,
} from "@/components/share/og-cards";
import {
  sharedItemStyle,
  sharedItemSubtitle,
} from "@/components/share/SharedItemView";
import { itemTypeOfSegment } from "@/lib/share/routes";
import { displayItemName } from "@/utilities/smart-title-case";

export const alt = "On Cellar Assistant";
export const size = OG_SIZE;
export const contentType = "image/png";
/**
 * Rendered per request, never cached as a static asset: a list made private,
 * or a photo taken down, must stop showing in previews at once — the page
 * itself is `force-dynamic` for the same reason.
 */
export const dynamic = "force-dynamic";

/** The preview card for a shared item: its public photo, name and score. */
export default async function Image({
  params,
}: {
  params: Promise<{ segment: string; itemId: string }>;
}) {
  const { segment, itemId } = await params;
  const type = itemTypeOfSegment(segment);
  if (type === null) return new ImageResponse(<BrandCard />, size);
  const result = await loadSharedItem(type, itemId);
  if (!result.ok) return new ImageResponse(<BrandCard />, size);
  const item = result.data;
  return new ImageResponse(
    <ItemCard
      type={type}
      typeLabel={itemTypeLabel(type)}
      name={displayItemName(item.name)}
      subtitle={sharedItemSubtitle(
        type,
        item,
        (item.attributes ?? {}) as Record<string, unknown>,
      )}
      style={sharedItemStyle(
        (item.attributes ?? {}) as Record<string, unknown>,
      )}
      scoreAverage={item.scoreAverage}
      scoreCount={item.scoreCount}
      image={await inlineImage(item.imageUrl)}
    />,
    size,
  );
}
