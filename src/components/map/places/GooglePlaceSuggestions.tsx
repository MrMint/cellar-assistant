"use client";

import { MdPlace } from "react-icons/md";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/joy";
import type { GoogleNearbyPlace } from "@/app/(authenticated)/map/place-actions";

interface GooglePlaceSuggestionsProps {
  places: GoogleNearbyPlace[];
  loading: boolean;
  onSelect: (place: GoogleNearbyPlace) => void;
  onDismiss: () => void;
}

/** Maps Google place types to user-friendly labels. */
function formatPlaceType(type: string): string {
  return type.replace(/_/g, " ");
}

export function GooglePlaceSuggestions({
  places,
  loading,
  onSelect,
  onDismiss,
}: GooglePlaceSuggestionsProps) {
  if (loading) {
    return (
      <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
        <CircularProgress size="sm" />
        <Typography level="body-sm" color="neutral">
          Checking for known places nearby...
        </Typography>
      </Box>
    );
  }

  if (places.length === 0) return null;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography level="title-sm" color="primary" sx={{ mb: 1 }}>
        We found these places nearby. Is yours one of them?
      </Typography>
      <Stack spacing={1}>
        {places.map((place) => (
          <Card key={place.googlePlaceId} variant="outlined" size="sm">
            <CardContent
              sx={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <MdPlace size={20} />
                  <Typography level="title-sm" noWrap>
                    {place.name}
                  </Typography>
                </Stack>
                <Stack
                  direction="row"
                  spacing={0.5}
                  sx={{ mt: 0.5 }}
                  flexWrap="wrap"
                >
                  {place.types.slice(0, 2).map((type) => (
                    <Chip key={type} size="sm" variant="soft">
                      {formatPlaceType(type)}
                    </Chip>
                  ))}
                </Stack>
                {place.address && (
                  <Typography level="body-xs" sx={{ mt: 0.5 }} noWrap>
                    {place.address}
                  </Typography>
                )}
              </Box>
              <Button
                size="sm"
                variant="outlined"
                onClick={() => onSelect(place)}
              >
                This is it
              </Button>
            </CardContent>
          </Card>
        ))}
      </Stack>
      <Button
        size="sm"
        variant="plain"
        color="neutral"
        onClick={onDismiss}
        sx={{ mt: 1 }}
      >
        None of these — I'll enter details manually
      </Button>
    </Box>
  );
}
