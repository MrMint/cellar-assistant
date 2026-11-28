import type { Metadata } from "next";
import { Page } from "@/components/app/Page";
import { BarAppBar } from "@/components/bar/BarAppBar";
import { BAR_SECTION_LIMIT, YourBarQuery } from "@/components/bar/queries";
import { WhatCanIMake } from "@/components/bar/WhatCanIMake";
import { BarLoadError } from "@/components/bar/your-bar/BarLoadError";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";

export const metadata: Metadata = { title: "Your bar" };

/**
 * `/recipes/bar` — **Your bar** (Recipes-Make board; G29, D18): Make now ·
 * One bottle away, from the viewer's own cellars and pantry (D23).
 *
 * Read fresh on every visit: a bottle finished or a pantry toggle flipped a
 * moment ago has to show.
 */
export const dynamic = "force-dynamic";

export default async function BarPage() {
  const data = await apiServerQuery(YourBarQuery, {
    limit: BAR_SECTION_LIMIT,
  });
  const result = unwrapResult(data.whatCanIMake, "WhatCanIMake");

  return (
    <Page>
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
        <>
          <BarAppBar />
          <BarLoadError title="Couldn't load your bar" />
        </>
      )}
    </Page>
  );
}
