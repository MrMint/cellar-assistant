"use client";

import {
  Box,
  Card,
  CardContent,
  Chip,
  Skeleton,
  Stack,
  Typography,
} from "@mui/joy";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  MdAutoAwesome,
  MdExplore,
  MdLocalFireDepartment,
  MdPerson,
  MdRestaurant,
  MdUpdate,
} from "react-icons/md";

import type { TierListAIInsights } from "../types";

const POLL_INTERVAL_MS = 15_000;
const MAX_POLLS = 8; // stop after ~2 minutes

interface AIAnalysisProps {
  insights: TierListAIInsights | null;
  itemCount: number;
  contentUpdatedAt: string | null;
}

export function AIAnalysis({
  insights,
  itemCount,
  contentUpdatedAt,
}: AIAnalysisProps) {
  const router = useRouter();
  const pollCount = useRef(0);

  useEffect(() => {
    // Only poll when insights are expected but not yet available
    if (insights || itemCount < 3) {
      pollCount.current = 0;
      return;
    }

    const timer = setInterval(() => {
      if (pollCount.current >= MAX_POLLS) {
        clearInterval(timer);
        return;
      }
      pollCount.current += 1;
      router.refresh();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [insights, itemCount, router]);

  if (itemCount < 3) {
    return (
      <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
        Add at least 3 items to unlock AI insights.
      </Typography>
    );
  }

  if (!insights) {
    return (
      <Stack spacing={2}>
        <Typography level="title-md">AI Analysis</Typography>
        <Card variant="outlined">
          <CardContent>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mb: 1 }}
            >
              <MdAutoAwesome />
              <Typography level="title-sm">Palate Profile</Typography>
            </Stack>
            <Skeleton variant="text" level="body-sm" />
            <Skeleton variant="text" level="body-sm" />
            <Skeleton variant="text" level="body-sm" width="60%" />
            <Typography level="body-xs" sx={{ color: "text.tertiary", mt: 1 }}>
              AI analysis is being generated — this may take a moment.
            </Typography>
          </CardContent>
        </Card>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Typography level="title-md">AI Analysis</Typography>

      {/* Archetype badge */}
      {insights.archetype && (
        <Card
          variant="soft"
          color="primary"
          sx={{ textAlign: "center", py: 2.5 }}
        >
          <CardContent>
            <Stack spacing={0.5} alignItems="center">
              <Chip
                variant="solid"
                color="primary"
                size="lg"
                startDecorator={<MdPerson />}
              >
                {insights.archetype}
              </Chip>
              {insights.archetypeDescription && (
                <Typography
                  level="body-sm"
                  sx={{ color: "primary.plainColor", mt: 1, maxWidth: 360 }}
                >
                  {insights.archetypeDescription}
                </Typography>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Hot Take */}
      {insights.hotTake && (
        <Card variant="outlined">
          <CardContent>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mb: 1 }}
            >
              <MdLocalFireDepartment />
              <Typography level="title-sm">Hot Take</Typography>
            </Stack>
            <Box
              sx={{
                borderLeft: "3px solid",
                borderColor: "warning.400",
                pl: 1.5,
              }}
            >
              <Typography level="body-sm" sx={{ fontStyle: "italic" }}>
                {insights.hotTake}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Palate Profile */}
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <MdAutoAwesome />
            <Typography level="title-sm">Palate Profile</Typography>
          </Stack>
          <Typography level="body-sm">{insights.palateProfile}</Typography>
        </CardContent>
      </Card>

      {/* Blind Spots */}
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <MdExplore />
            <Typography level="title-sm">Blind Spots</Typography>
          </Stack>
          <Typography level="body-sm">{insights.blindSpots}</Typography>
        </CardContent>
      </Card>

      {/* Recommendation */}
      {insights.recommendation && (
        <Card variant="outlined">
          <CardContent>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mb: 1 }}
            >
              <MdRestaurant />
              <Typography level="title-sm">Try This Next</Typography>
            </Stack>
            <Typography level="body-sm">{insights.recommendation}</Typography>
          </CardContent>
        </Card>
      )}

      {insights.generatedAt && (
        <Stack spacing={0.5}>
          <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
            Last analyzed:{" "}
            {new Date(insights.generatedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </Typography>
          {contentUpdatedAt &&
            new Date(contentUpdatedAt) > new Date(insights.generatedAt) && (
              <Stack
                direction="row"
                spacing={0.5}
                alignItems="center"
                sx={{ color: "warning.500" }}
              >
                <MdUpdate style={{ fontSize: 14 }} />
                <Typography level="body-xs" sx={{ color: "inherit" }}>
                  Your list has changed since this analysis. Updated insights
                  will generate automatically.
                </Typography>
              </Stack>
            )}
        </Stack>
      )}
    </Stack>
  );
}
