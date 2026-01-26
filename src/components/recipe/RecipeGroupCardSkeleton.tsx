"use client";

import {
  AspectRatio,
  Box,
  Card,
  CardContent,
  CardOverflow,
  Skeleton,
  Stack,
} from "@mui/joy";

export type RecipeGroupCardSkeletonProps = {
  count?: number;
};

export const RecipeGroupCardSkeleton = ({
  count = 1,
}: RecipeGroupCardSkeletonProps) => {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} variant="outlined">
          <CardOverflow>
            <AspectRatio ratio="4/3">
              <Skeleton variant="overlay" />
            </AspectRatio>
          </CardOverflow>

          <CardContent sx={{ gap: 1 }}>
            {/* Recipe Group Name */}
            <Skeleton variant="text" level="title-md" />

            {/* Featured Recipe Name */}
            <Skeleton variant="text" level="body-sm" width="70%" />

            {/* Description */}
            <Box sx={{ mt: 1 }}>
              <Skeleton variant="text" level="body-sm" />
              <Skeleton variant="text" level="body-sm" width="80%" />
            </Box>

            {/* Recipe Details */}
            <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
              <Skeleton variant="text" level="body-xs" width="60px" />
              <Skeleton variant="text" level="body-xs" width="40px" />
              <Skeleton variant="text" level="body-xs" width="70px" />
            </Stack>

            {/* Category and Tags */}
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Skeleton
                variant="rectangular"
                width="80px"
                height="24px"
                sx={{ borderRadius: "sm" }}
              />
              <Skeleton
                variant="rectangular"
                width="60px"
                height="24px"
                sx={{ borderRadius: "sm" }}
              />
              <Skeleton
                variant="rectangular"
                width="90px"
                height="24px"
                sx={{ borderRadius: "sm" }}
              />
            </Stack>

            {/* Tags */}
            <Stack direction="row" spacing={0.5} sx={{ mt: 1 }}>
              <Skeleton
                variant="rectangular"
                width="50px"
                height="20px"
                sx={{ borderRadius: "sm" }}
              />
              <Skeleton
                variant="rectangular"
                width="65px"
                height="20px"
                sx={{ borderRadius: "sm" }}
              />
              <Skeleton
                variant="rectangular"
                width="45px"
                height="20px"
                sx={{ borderRadius: "sm" }}
              />
            </Stack>
          </CardContent>
        </Card>
      ))}
    </>
  );
};
