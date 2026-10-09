import { type CellarSectionSeed, Cellars } from "@/components/cellar/Cellars";
import { GetCellarsQuery } from "@/components/cellar/fragments";
import { sectionPageSize } from "@/components/cellar-api/pagination";
import type { SectionKey } from "@/components/common/CollectionSection";
import { ViewerQuery } from "@/lib/api/cellars";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { toPage } from "@/lib/paging/paged-connection";

/**
 * `/cellars` — Yours, From friends and Discover (decision D2, X11), each a
 * server-rendered first page of `myCellars(section:)`.
 *
 * All four reads share one token exchange (`getApiToken()` is `cache()`d per
 * request) and run in parallel. A section that fails renders its error in
 * place; the other two still render.
 */
export const dynamic = "force-dynamic";

const SECTIONS: readonly SectionKey[] = ["MINE", "FRIENDS", "DISCOVER"];

const EMPTY_PAGE = { rows: [], endCursor: null, hasNextPage: false };

async function sectionSeed(section: SectionKey): Promise<CellarSectionSeed> {
  const data = await apiServerQuery(GetCellarsQuery, {
    first: sectionPageSize(section),
    after: null,
    section,
  });
  const result = unwrapResult(data.myCellars, "CellarConnection");
  return result.ok
    ? { page: toPage(result.data), failure: null }
    : { page: EMPTY_PAGE, failure: result.error };
}

export default async function CellarsPage() {
  const [viewer, ...seeds] = await Promise.all([
    apiServerQuery(ViewerQuery, {}),
    ...SECTIONS.map(sectionSeed),
  ]);
  const sections = Object.fromEntries(
    SECTIONS.map((section, index) => [section, seeds[index]]),
  ) as Record<SectionKey, CellarSectionSeed>;

  return <Cellars userId={viewer.me?.id ?? ""} sections={sections} />;
}
