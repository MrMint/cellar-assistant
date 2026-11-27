import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { CreatePlaceForm } from "@/components/map/places/CreatePlaceForm";
import { PlaceForEditQuery } from "@/components/map/queries";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";

/**
 * X27 / D28: "Edit & resubmit" for a place under review — the create form,
 * given the place's own values, sending `resubmitPlace` on save.
 *
 * Only the person who added a pending or rejected place can see it, so for
 * anybody else this is the shell's one not-found message (D24), exactly as
 * the place page is. A shared place is no longer editable here and goes back
 * to its page.
 */
export const dynamic = "force-dynamic";

interface EditPlacePageProps {
  params: Promise<{ placeId: string }>;
}

/** One edit read per request, for the page and its title (X21). */
const loadPlaceForEdit = cache((placeId: string) =>
  apiServerQuery(PlaceForEditQuery, { id: placeId }),
);

export async function generateMetadata({
  params,
}: EditPlacePageProps): Promise<Metadata> {
  const { placeId } = await params;
  const read = unwrapResult((await loadPlaceForEdit(placeId)).place, "Place");
  return { title: read.ok ? `Edit ${read.data.name}` : "Edit place" };
}

export default async function EditPlacePage({ params }: EditPlacePageProps) {
  const { placeId } = await params;
  const { place } = await loadPlaceForEdit(placeId);
  const result = unwrapResult(place, "Place");
  if (!result.ok) {
    if (isNotFound(result.error)) notFound();
    throw new Error(result.error.message);
  }
  const data = result.data;
  if (data.reviewStatus === "APPROVED") redirect(`/places/${placeId}`);

  return (
    <div className="mx-auto max-w-[600px] px-4 py-4 md:py-8">
      <h1 className="t-title mb-6 text-ink">
        {data.reviewStatus === "REJECTED" ? "Edit & resubmit" : "Edit place"}
      </h1>
      <CreatePlaceForm
        latitude={data.location.lat}
        longitude={data.location.lng}
        edit={{
          placeId: data.id,
          reviewStatus: data.reviewStatus,
          rejectionReason: data.rejectionReason ?? null,
          values: {
            name: data.name,
            categories: data.categories,
            street_address: data.streetAddress ?? "",
            locality: data.locality ?? "",
            region: data.region ?? "",
            postcode: data.postcode ?? "",
            country_code: data.countryCode ?? "",
            phone: data.phone ?? "",
            website: data.website ?? "",
            description: data.description ?? "",
          },
        }}
      />
    </div>
  );
}
