import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { loadSharedItem } from "@/components/share/loaders";
import {
  NOT_SHARED_METADATA,
  shareMetadata,
} from "@/components/share/metadata";
import {
  SharedItemView,
  sharedItemSubtitle,
} from "@/components/share/SharedItemView";
import { ShareFrame } from "@/components/share/ShareFrame";
import { isNotFound } from "@/lib/api/result";
import { canonicalPath, itemTypeOfSegment } from "@/lib/share/routes";
import { getOptionalServerUser } from "@/utilities/auth-server";
import { displayItemName } from "@/utilities/smart-title-case";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ segment: string; itemId: string }> };

const load = async (segment: string, itemId: string) => {
  const type = itemTypeOfSegment(segment);
  if (type === null) return null;
  return { type, result: await loadSharedItem(type, itemId) };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { segment, itemId } = await params;
  const loaded = await load(segment, itemId);
  if (loaded === null || !loaded.result.ok) return NOT_SHARED_METADATA;
  const item = loaded.result.data;
  const subtitle = sharedItemSubtitle(
    loaded.type,
    item,
    (item.attributes ?? {}) as Record<string, unknown>,
  );
  return shareMetadata({
    title: displayItemName(item.name),
    description:
      subtitle === ""
        ? "On Cellar Assistant."
        : `${subtitle}. On Cellar Assistant.`,
    canonicalPath: canonicalPath({
      kind: "item",
      type: loaded.type,
      id: item.id,
    }),
  });
}

/**
 * `/wines/<id>` (and the other five item pages) for a signed-out viewer
 * (`src/proxy.ts` rewrites it here): catalog facts, a public photo and the
 * everyone score — never a review, a cellar or anything of a person's.
 */
export default async function SharedItemPage({ params }: Props) {
  const { segment, itemId } = await params;
  const type = itemTypeOfSegment(segment);
  if (type === null) notFound();
  const canonical = canonicalPath({ kind: "item", type, id: itemId });
  if ((await getOptionalServerUser()) !== null) redirect(canonical);

  const loaded = await load(segment, itemId);
  if (loaded === null) notFound();
  if (!loaded.result.ok) {
    if (isNotFound(loaded.result.error)) notFound();
    throw new Error(loaded.result.error.message);
  }
  const item = loaded.result.data;
  return (
    <ShareFrame
      canonicalPath={canonical}
      pitch="Keep track of every bottle, and what you thought of it."
      cta="Join Cellar Assistant"
    >
      <SharedItemView
        type={type}
        name={item.name}
        description={item.description}
        country={item.country}
        attributes={(item.attributes ?? {}) as Record<string, unknown>}
        imageUrl={item.imageUrl}
        scoreAverage={item.scoreAverage}
        scoreCount={item.scoreCount}
      />
    </ShareFrame>
  );
}
