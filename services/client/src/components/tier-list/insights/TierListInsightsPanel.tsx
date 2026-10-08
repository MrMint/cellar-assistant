"use client";

/**
 * `82450ad1:src/components/tier-list/insights/TierListInsightsPanel.tsx`,
 * restored. Changes: the date goes through `Timestamp` (hydration-safe, same
 * medium date); passport, heatmap and category donut show for place lists
 * only (`showPlaceStats`), and Blind Spots only when generated.
 *
 * N07: whether "Generating Insights" shows, whether the page polls, and what
 * is said instead is `insightsView`'s decision, from the server's
 * `insightsStatus` — never inferred from a missing `aiInsights` any more.
 */

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

import { AiStatus } from "@/components/common/AiStatus";
import { Timestamp } from "@/components/common/Timestamp";
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
import { insightsView } from "./insights-view";
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
  const view = insightsView({
    status: insights.status ?? null,
    failureReason: insights.failureReason ?? null,
    retryAt: insights.retryAt ?? null,
    hasInsights: ai !== null,
    itemCount,
  });
  const shouldPoll = view.poll;

  // Poll only while the server says an answer is on its way, and never more
  // than MAX_POLLS times however long that takes.
  useEffect(() => {
    if (!shouldPoll) {
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
  }, [shouldPoll, router]);

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

  const isGenerating = view.generating;

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

      {/* Why there are no (new) insights, when that is the news */}
      {view.notice !== null && <AiStatus outcome={view.notice} />}
      {view.hint !== null && (
        <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
          {view.hint}
        </Typography>
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
      {insights.showPlaceStats && categoryDistribution.length > 1 && (
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
      {insights.showPlaceStats && (
        <Card variant="outlined">
          <CardContent>
            <PalatePassport stats={passportStats} />
          </CardContent>
        </Card>
      )}

      {/* Country Heatmap */}
      {insights.showPlaceStats && heatmapEntries.length > 0 && (
        <Card variant="outlined">
          <CardContent sx={{ "&:last-child": { pb: 2 } }}>
            <CountryHeatmap entries={heatmapEntries} />
          </CardContent>
        </Card>
      )}

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
      {ai?.blindSpots && (
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
            Last analyzed: <Timestamp iso={ai.generatedAt} precision="date" />
          </Typography>
          {view.hint === null &&
            insights.contentUpdatedAt &&
            new Date(insights.contentUpdatedAt) > new Date(ai.generatedAt) && (
              <Stack
                direction="row"
                spacing={0.5}
                alignItems="center"
                sx={{ color: "warning.500" }}
              >
                <MdUpdate style={{ fontSize: 14 }} />
                <Typography level="body-xs" sx={{ color: "inherit" }}>
                  Your list has changed since this analysis.
                </Typography>
              </Stack>
            )}
        </Stack>
      )}
    </Stack>
  );
}
