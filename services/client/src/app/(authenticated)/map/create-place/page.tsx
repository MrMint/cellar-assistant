import { Box, Typography } from "@mui/joy";
import { redirect } from "next/navigation";
import { CreatePlaceForm } from "@/components/map/places/CreatePlaceForm";

/**
 * `82450ad1:src/app/(authenticated)/map/create-place/page.tsx`, restored.
 * The form opens on the map's centre pin (`?lat=&lng=`); without one it goes
 * back to the map, as before. The auth check is the group layout's.
 */
export const dynamic = "force-dynamic";

interface CreatePlacePageProps {
  searchParams: Promise<{ lat?: string; lng?: string }>;
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
    <Box
      sx={{
        maxWidth: 600,
        mx: "auto",
        py: { xs: 2, md: 4 },
        px: 2,
      }}
    >
      <Typography level="h3" sx={{ mb: 3 }}>
        Add a new place
      </Typography>
      <CreatePlaceForm latitude={lat} longitude={lng} />
    </Box>
  );
}
