import { ImageResponse } from "next/og";
import { loadSharedTierList, nodesOf } from "@/components/share/loaders";
import { BrandCard, OG_SIZE, TierListCard } from "@/components/share/og-cards";
import { topEntries } from "@/lib/share/tier-bands";

export const alt = "A ranked list on Cellar Assistant";
export const size = OG_SIZE;
export const contentType = "image/png";

/** The preview card for a shared tier list: its name, author and top three. */
export default async function Image({
  params,
}: {
  params: Promise<{ tierListId: string }>;
}) {
  const { tierListId } = await params;
  const result = await loadSharedTierList(tierListId);
  if (!result.ok) return new ImageResponse(<BrandCard />, size);
  const list = result.data;
  return new ImageResponse(
    <TierListCard
      name={list.name}
      ownerDisplayName={list.ownerDisplayName}
      top={topEntries(nodesOf(list.entries), 3)}
    />,
    size,
  );
}
