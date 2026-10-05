import { RankingsClient } from "@/components/ranking/RankingsClient";

/**
 * `/rankings` — the old `RankingsClient` (`82450ad1`), which fetches its own
 * first page from the URL's filters. The old page read the viewer's id only to
 * build a reviewer uuid list; `Query.rankings` resolves the scope server-side
 * (`components/ranking/fragments.ts`), so there is nothing to pass down.
 */
export const dynamic = "force-dynamic";

export default function Rankings() {
  return <RankingsClient />;
}
