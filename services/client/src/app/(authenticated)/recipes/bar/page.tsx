import { Page } from "@/components/app/Page";
import { BarAppBar } from "@/components/bar/BarAppBar";
import { BAR_SECTION_LIMIT, WhatCanIMakeQuery } from "@/components/bar/queries";
import { WhatCanIMake } from "@/components/bar/WhatCanIMake";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";

/**
 * `/recipes/bar` — **What can I make** (G29, D18): Make now · One bottle
 * away, from the viewer's own cellars and Bar pantry (D23). Under `/recipes`,
 * so the Cellar tab stays lit (its "Bar" segment, D1).
 *
 * Read fresh on every visit: a bottle finished or a pantry toggle flipped a
 * moment ago has to show.
 */
export const dynamic = "force-dynamic";

export default async function BarPage() {
  const data = await apiServerQuery(WhatCanIMakeQuery, {
    limit: BAR_SECTION_LIMIT,
  });
  const result = unwrapResult(data.whatCanIMake, "WhatCanIMake");

  return (
    <Page>
      <BarAppBar />
      {result.ok ? (
        <WhatCanIMake
          data={{
            makeNow: result.data.makeNow.edges.map((edge) => edge.node),
            oneBottleAway: result.data.oneBottleAway.edges.map(
              (edge) => edge.node,
            ),
            makeNowCount: result.data.makeNowCount,
            oneBottleAwayCount: result.data.oneBottleAwayCount,
            bottleCount: result.data.bottleCount,
            pantryCount: result.data.pantryCount,
            scanned: result.data.scanned,
          }}
        />
      ) : (
        <p role="alert" className="type-body text-destructive">
          {result.error.message}
        </p>
      )}
    </Page>
  );
}
