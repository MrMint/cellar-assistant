import { Suspense } from "react";
import { PlaceDetails } from "@/components/map/places/PlaceDetails";
import {
  PlaceDetailsShell,
  type PlaceHero,
} from "@/components/map/places/PlaceDetailsShell";
import { PlaceHeroQuery } from "@/components/map/queries";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";

/**
 * `82450ad1:src/app/(authenticated)/places/[placeId]/page.tsx`, restored.
 *
 * The old page queried the enrichment **during render** and, when it was
 * missing, called Google from the server component before answering (§7).
 * `PlaceDetails` now reads the place on the client and asks for enrichment
 * from an effect (`usePlaceEnrichment`: once, then a bounded poll), and the
 * "On Lists" card comes from `Place.tierListEntries` instead of a server slot.
 *
 * One read stays on the server: whether the place is there for this viewer at
 * all, and its hero. A missing or hidden place is `notFound()` in this
 * segment's `layout.tsx` — a 404 and the shell's one message (D24) — where
 * the client alone could only answer 200 with its own. The name and category
 * go to `PlaceDetails` as its hero (X24), so they are drawn while the client
 * read is still on its way instead of after it.
 */
export const dynamic = "force-dynamic";

interface PlaceDetailsPageProps {
  params: Promise<{
    placeId: string;
  }>;
}

export default async function PlaceDetailsPage({
  params,
}: PlaceDetailsPageProps) {
  const { placeId } = await params;

  const { place } = await apiServerQuery(PlaceHeroQuery, { id: placeId });
  const read = unwrapResult(place, "Place");
  const hero: PlaceHero | undefined = read.ok
    ? {
        name: read.data.name,
        category: read.data.primaryCategory ?? read.data.categories[0] ?? null,
      }
    : undefined;

  // No wrapper of its own: the shell's scroller is the one element that
  // scrolls (D26) and supplies the gutter, and PlaceDetails is a `Page`.
  return (
    <Suspense fallback={<PlaceDetailsShell hero={hero} />}>
      <PlaceDetails placeId={placeId} hero={hero} />
    </Suspense>
  );
}
