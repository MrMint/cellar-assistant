import { redirect } from "next/navigation";
import { CreatePlaceForm } from "@/components/map/places/CreatePlaceForm";

/**
 * `82450ad1:src/app/(authenticated)/map/create-place/page.tsx`, restored.
 * The form opens on the map's centre pin (`?lat=&lng=`); without one it goes
 * back to the map, as before. The auth check is the group layout's.
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

  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    redirect("/map");
  }

  return (
    <div className="mx-auto max-w-[600px] px-4 py-4 md:py-8">
      <h1 className="type-title-2 mb-6 text-ink-1">Add a new place</h1>
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
