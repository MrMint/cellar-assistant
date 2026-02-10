"use client";

import { Place } from "@mui/icons-material";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from "@mui/joy";
import type { DuplicatePlace } from "@/app/(authenticated)/map/place-actions";

interface DuplicatePlaceCheckProps {
  duplicates: DuplicatePlace[];
  onSelectExisting: (placeId: string) => void;
  onConfirmNew: () => void;
}

export function DuplicatePlaceCheck({
  duplicates,
  onSelectExisting,
  onConfirmNew,
}: DuplicatePlaceCheckProps) {
  if (duplicates.length === 0) return null;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography level="title-sm" color="warning" sx={{ mb: 1 }}>
        We found similar places nearby. Is yours one of these?
      </Typography>
      <Stack spacing={1}>
        {duplicates.map((dup) => (
          <Card key={dup.id} variant="outlined" size="sm">
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
                  <Place fontSize="small" color="action" />
                  <Typography level="title-sm" noWrap>
                    {dup.name}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                  {dup.primary_category && (
                    <Chip size="sm" variant="soft">
                      {dup.primary_category.replace(/_/g, " ")}
                    </Chip>
                  )}
                  <Chip size="sm" variant="outlined">
                    {Math.round(dup.distance_m)}m away
                  </Chip>
                  <Chip
                    size="sm"
                    variant="outlined"
                    color={dup.similarity > 0.7 ? "warning" : "neutral"}
                  >
                    {Math.round(dup.similarity * 100)}% match
                  </Chip>
                </Stack>
                {(dup.street_address || dup.locality) && (
                  <Typography level="body-xs" sx={{ mt: 0.5 }} noWrap>
                    {[dup.street_address, dup.locality]
                      .filter(Boolean)
                      .join(", ")}
                  </Typography>
                )}
              </Box>
              <Button
                size="sm"
                variant="outlined"
                onClick={() => onSelectExisting(dup.id)}
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
        onClick={onConfirmNew}
        sx={{ mt: 1 }}
      >
        None of these — create new place
      </Button>
    </Box>
  );
}
