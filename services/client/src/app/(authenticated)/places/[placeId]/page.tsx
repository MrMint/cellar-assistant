import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PlaceDetails } from "@/components/map/places/PlaceDetails";
import { PlaceExistsQuery } from "@/components/map/queries";
import { Spinner } from "@/components/ui/spinner";
import { isNotFound, unwrapResult } from "@/lib/api/result";
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
 * all. A missing or hidden place is `notFound()` — a 404 and the shell's one
 * message (D24) — where the client alone could only answer 200 with its own.
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

  if (!placeId) {
    notFound();
  }

  const { place } = await apiServerQuery(PlaceExistsQuery, { id: placeId });
  const exists = unwrapResult(place, "Place");
  // Any other failure is `PlaceDetails`'s to report, as before.
  if (!exists.ok && isNotFound(exists.error)) notFound();

  return (
    <div className="h-dvh overflow-auto p-4">
      <Suspense
        fallback={
          <div className="flex h-[50vh] flex-col items-center justify-center gap-4">
            <Spinner className="size-10 text-ink-2" />
            <p className="type-body text-ink-1">Loading place details...</p>
          </div>
        }
      >
        <PlaceDetails placeId={placeId} />
      </Suspense>
    </div>
  );
}
