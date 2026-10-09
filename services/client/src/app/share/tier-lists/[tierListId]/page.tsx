import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { loadSharedTierList, nodesOf } from "@/components/share/loaders";
import {
  NOT_SHARED_METADATA,
  shareMetadata,
  tierListDescription,
} from "@/components/share/metadata";
import { SharedTierListView } from "@/components/share/SharedTierListView";
import { ShareFrame } from "@/components/share/ShareFrame";
import { isNotFound } from "@/lib/api/result";
import { canonicalPath } from "@/lib/share/routes";
import { getOptionalServerUser } from "@/utilities/auth-server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ tierListId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tierListId } = await params;
  const result = await loadSharedTierList(tierListId);
  if (!result.ok) return NOT_SHARED_METADATA;
  const list = result.data;
  return shareMetadata({
    title: list.name,
    description: tierListDescription({
      ownerDisplayName: list.ownerDisplayName,
      entries: nodesOf(list.entries),
    }),
    canonicalPath: canonicalPath({ kind: "tier-list", id: list.id }),
  });
}

/**
 * `/tier-lists/<id>` for a signed-out viewer (`src/proxy.ts` rewrites it
 * here): a PUBLIC tier list, read through the anonymous client. Anything
 * else — FRIENDS, PRIVATE, missing — is the one not-found page (D24). A
 * signed-in viewer who opens `/share/…` directly goes to the real page.
 */
export default async function SharedTierListPage({ params }: Props) {
  const { tierListId } = await params;
  const canonical = canonicalPath({ kind: "tier-list", id: tierListId });
  if ((await getOptionalServerUser()) !== null) redirect(canonical);

  const result = await loadSharedTierList(tierListId);
  if (!result.ok) {
    if (isNotFound(result.error)) notFound();
    throw new Error(result.error.message);
  }
  const list = result.data;
  const entries = nodesOf(list.entries);
  return (
    <ShareFrame
      canonicalPath={canonical}
      pitch="Rank what you drink, and see what your friends rank."
      cta="Join Cellar Assistant"
    >
      <SharedTierListView
        name={list.name}
        description={list.description}
        listType={list.listType}
        ownerDisplayName={list.ownerDisplayName}
        entries={entries}
        moreCount={Math.max(0, (list.entries.totalCount ?? 0) - entries.length)}
      />
    </ShareFrame>
  );
}
