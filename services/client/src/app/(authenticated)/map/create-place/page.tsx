import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreatePlaceForm } from "@/components/map/places/CreatePlaceForm";

export const metadata: Metadata = { title: "Add a place" };

/**
 * `82450ad1:src/app/(authenticated)/map/create-place/page.tsx`, restored.
 * The form opens on the map's centre pin (`?lat=&lng=`); without one it is
 * the Add a place sheet over the live map (`/map?add=1`, FS-1), which is
 * also where the map's own Add a place opens it. The auth check is the group layout's.
 */
export const dynamic = "force-dynamic";

interface CreatePlacePageProps {
  /** `name`: N22's "Add it here" carries the searched name in. */
  searchParams: Promise<{
    lat?: string;
    lng?: string;
    name?: string | string[];
  }>;
}

export default async function CreatePlacePage({
  searchParams,
}: CreatePlacePageProps) {
  const params = await searchParams;

  const lat = params.lat ? Number.parseFloat(params.lat) : null;
  const lng = params.lng ? Number.parseFloat(params.lng) : null;

  // FS-1: without a pin, Add a place is the sheet over the live map.
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    redirect("/map?add=1");
  }

  return (
    <div className="mx-auto max-w-[600px] px-4 py-4 md:py-8">
      <h1 className="t-title mb-6 text-ink">Add a place</h1>
      <CreatePlaceForm
        latitude={lat}
        longitude={lng}
        initialName={
          // A repeated `?name=` arrives as an array; take none rather than throw.
          typeof params.name === "string"
            ? params.name.trim().slice(0, 200)
            : ""
        }
      />
    </div>
  );
}
