import type { Metadata } from "next";
import type { SectionKey } from "@/components/common/CollectionSection";
import {
  GetTierListsQuery,
  tierListPageSize,
} from "@/components/tier-list/queries";
import {
  type TierListSectionSeed,
  TierListsPage,
} from "@/components/tier-list/TierListsPage";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { toPage } from "@/lib/paging/paged-connection";

export const metadata: Metadata = { title: "Tier lists" };

/**
 * `/tier-lists` — Yours, From friends and Discover (decision D2, X11), each a
 * server-rendered first page of `myTierLists(section:)`, read in parallel. A
 * section that fails renders its error in place.
 */
export const dynamic = "force-dynamic";

const SECTIONS: readonly SectionKey[] = ["MINE", "FRIENDS", "DISCOVER"];

async function sectionSeed(section: SectionKey): Promise<TierListSectionSeed> {
  const data = await apiServerQuery(GetTierListsQuery, {
    first: tierListPageSize(section),
    after: null,
    section,
  });
  const result = unwrapResult(data.myTierLists, "TierListConnection");
  return result.ok
    ? { page: toPage(result.data, (edge) => edge.node), failure: null }
    : {
        page: { rows: [], endCursor: null, hasNextPage: false },
        failure: result.error,
      };
}

export default async function TierListsIndexPage() {
  const seeds = await Promise.all(SECTIONS.map(sectionSeed));
  const sections = Object.fromEntries(
    SECTIONS.map((section, index) => [section, seeds[index]]),
  ) as Record<SectionKey, TierListSectionSeed>;
  return <TierListsPage sections={sections} />;
}
