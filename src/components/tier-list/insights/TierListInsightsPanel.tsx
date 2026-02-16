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
import { useEffect, useMemo, useRef } from "react";
import {
  MdAutoAwesome,
  MdExplore,
  MdLocalFireDepartment,
  MdPerson,
  MdRestaurant,
  MdUpdate,
} from "react-icons/md";

import type { TierListInsightsData } from "../types";
import { BandDistributionChart } from "./BandDistributionChart";
import { CategoryDonutChart } from "./CategoryDonutChart";
import { CountryHeatmap } from "./CountryHeatmap";
import {
  computeBandDistribution,
  computeCategoryDistribution,
  computeCountryHeatmap,
  computePalatePassport,
} from "./computeInsightsStats";
import { PalatePassport } from "./PalatePassport";

const POLL_INTERVAL_MS = 15_000;
const MAX_POLLS = 8;

interface TierListInsightsPanelProps {
  insights: TierListInsightsData;
}

export function TierListInsightsPanel({
  insights,
}: TierListInsightsPanelProps) {
  const router = useRouter();
  const pollCount = useRef(0);
  const ai = insights.aiInsights;
  const itemCount = insights.items.length;

  // Poll for AI insights when expected but not yet available
  useEffect(() => {
    if (ai || itemCount < 3) {
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
  }, [ai, itemCount, router]);

  const bandDistribution = useMemo(
    () => computeBandDistribution(insights.items),
    [insights.items],
  );

  const passportStats = useMemo(
    () => computePalatePassport(insights.items),
    [insights.items],
  );

  const categoryDistribution = useMemo(
    () => computeCategoryDistribution(insights.items),
    [insights.items],
  );

  const heatmapEntries = useMemo(
    () => computeCountryHeatmap(insights.items),
    [insights.items],
  );

  if (itemCount === 0) {
    return (
      <Typography level="body-sm" sx={{ color: "text.tertiary", py: 4 }}>
        Add items to your tier list to see insights.
      </Typography>
    );
  }

  const isGenerating = !ai && itemCount >= 3;

  return (
    <Stack spacing={2} sx={{ py: 1 }}>
      {/* Archetype Hero */}
      {ai?.archetype && (
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
                {ai.archetype}
              </Chip>
              {ai.archetypeDescription && (
                <Typography
                  level="body-sm"
                  sx={{ color: "primary.plainColor", mt: 1, maxWidth: 360 }}
                >
                  {ai.archetypeDescription}
                </Typography>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Generating indicator */}
      {isGenerating && (
        <Card variant="outlined">
          <CardContent>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mb: 1 }}
            >
              <MdAutoAwesome />
              <Typography level="title-sm">Generating Insights</Typography>
            </Stack>
            <Skeleton variant="text" level="body-sm" />
            <Skeleton variant="text" level="body-sm" />
            <Skeleton variant="text" level="body-sm" width="60%" />
            <Typography level="body-xs" sx={{ color: "text.tertiary", mt: 1 }}>
              Your personalized insights are being generated...
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Band Distribution */}
      <Card variant="outlined">
        <CardContent>
          <BandDistributionChart distribution={bandDistribution} />
        </CardContent>
      </Card>

      {/* Category Donut */}
      {categoryDistribution.length > 1 && (
        <Card variant="outlined">
          <CardContent>
            <CategoryDonutChart distribution={categoryDistribution} />
          </CardContent>
        </Card>
      )}

      {/* Hot Take */}
      {ai?.hotTake && (
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
                {ai.hotTake}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Palate Passport */}
      <Card variant="outlined">
        <CardContent>
          <PalatePassport stats={passportStats} />
        </CardContent>
      </Card>

      {/* Country Heatmap */}
      <Card variant="outlined">
        <CardContent sx={{ "&:last-child": { pb: 2 } }}>
          <CountryHeatmap entries={heatmapEntries} />
        </CardContent>
      </Card>

      {/* Palate Profile */}
      {ai && (
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
            <Typography level="body-sm">{ai.palateProfile}</Typography>
          </CardContent>
        </Card>
      )}

      {/* Blind Spots */}
      {ai && (
        <Card variant="outlined">
          <CardContent>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mb: 1 }}
            >
              <MdExplore />
              <Typography level="title-sm">Blind Spots</Typography>
            </Stack>
            <Typography level="body-sm">{ai.blindSpots}</Typography>
          </CardContent>
        </Card>
      )}

      {/* Try This Next */}
      {ai?.recommendation && (
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
            <Typography level="body-sm">{ai.recommendation}</Typography>
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      {ai?.generatedAt && (
        <Stack spacing={0.5}>
          <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
            Last analyzed:{" "}
            {new Date(ai.generatedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </Typography>
          {insights.contentUpdatedAt &&
            new Date(insights.contentUpdatedAt) > new Date(ai.generatedAt) && (
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
