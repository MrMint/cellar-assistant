"use client";

import { Box, Chip, Stack, Tooltip, Typography } from "@mui/joy";
import { useEffect, useRef, useState } from "react";
import type { IconType } from "react-icons";
import {
  MdCategory,
  MdLanguage,
  MdLayers,
  MdLocationOn,
  MdMap,
  MdStar,
  MdThumbDown,
  MdTrendingUp,
} from "react-icons/md";

import { formatCategoryName } from "../utils";
import type { PalatePassportStats } from "./computeInsightsStats";

const BADGE_ICONS: Record<string, IconType> = {
  globe: MdLanguage,
  category: MdCategory,
  star: MdStar,
  layers: MdLayers,
  pin: MdLocationOn,
  "thumbs-down": MdThumbDown,
};

function AnimatedNumber({ value }: { value: number }) {
  const displayRef = useRef(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const from = displayRef.current;
    const to = value;
    if (from === to) return;

    if (to === 0) {
      displayRef.current = 0;
      setDisplay(0);
      return;
    }

    const duration = 600;
    const start = performance.now();
    let frameId: number;

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      const current = Math.round(from + (to - from) * eased);
      displayRef.current = current;
      setDisplay(current);
      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [value]);

  return <>{display}</>;
}

interface PalatePassportProps {
  stats: PalatePassportStats;
}

export function PalatePassport({ stats }: PalatePassportProps) {
  const statCards = [
    {
      label: "Countries",
      value: stats.uniqueCountries,
      detail: stats.topCountry
        ? `Most visited: ${stats.topCountry}`
        : undefined,
      icon: <MdLanguage />,
    },
    {
      label: "Regions",
      value: stats.uniqueRegions,
      detail: undefined,
      icon: <MdMap />,
    },
    {
      label: "Categories",
      value: stats.uniqueCategories,
      detail: stats.topCategory
        ? `Top: ${formatCategoryName(stats.topCategory)}`
        : undefined,
      icon: <MdCategory />,
    },
  ];

  const earnedBadges = stats.badges.filter((b) => b.earned);
  const unearnedBadges = stats.badges.filter((b) => !b.earned);

  // Find the closest unearned badge (highest progress ratio, must have some progress)
  const closestUnearned = unearnedBadges
    .filter((b) => b.progress && b.progress.current > 0)
    .sort((a, b) => {
      const ratioA = (a.progress?.current ?? 0) / (a.progress?.target ?? 1);
      const ratioB = (b.progress?.current ?? 0) / (b.progress?.target ?? 1);
      return ratioB - ratioA;
    })[0];

  return (
    <Stack spacing={2}>
      <Typography level="title-md">Palate Passport</Typography>

      {/* Stat tiles */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)" },
          gap: 1.5,
        }}
      >
        {statCards.map((stat) => (
          <Box
            key={stat.label}
            sx={{
              p: 1.5,
              borderRadius: "sm",
              backgroundColor: "background.level1",
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <Box sx={{ color: "text.tertiary", fontSize: 20 }}>
                {stat.icon}
              </Box>
              <Box>
                <Typography
                  level="h4"
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                >
                  <AnimatedNumber value={stat.value} />
                </Typography>
                <Typography level="body-xs" sx={{ color: "text.secondary" }}>
                  {stat.label}
                </Typography>
              </Box>
            </Stack>
            {stat.detail && (
              <Typography
                level="body-xs"
                sx={{ color: "text.tertiary", mt: 0.5 }}
              >
                {stat.detail}
              </Typography>
            )}
          </Box>
        ))}
      </Box>

      {/* Badges — earned + locked */}
      <Stack spacing={1}>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <MdTrendingUp />
          <Typography level="body-sm" fontWeight="md">
            Badges
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {earnedBadges.map((badge) => {
            const BadgeIcon = BADGE_ICONS[badge.icon];
            return (
              <Tooltip key={badge.id} title={badge.description} arrow>
                <Chip
                  variant="soft"
                  color="success"
                  size="md"
                  startDecorator={BadgeIcon ? <BadgeIcon /> : undefined}
                >
                  {badge.label}
                </Chip>
              </Tooltip>
            );
          })}
          {unearnedBadges.map((badge) => {
            const BadgeIcon = BADGE_ICONS[badge.icon];
            return (
              <Tooltip key={badge.id} title={badge.description} arrow>
                <Chip
                  variant="outlined"
                  color="neutral"
                  size="md"
                  startDecorator={BadgeIcon ? <BadgeIcon /> : undefined}
                  sx={{ opacity: 0.45 }}
                >
                  {badge.label}
                </Chip>
              </Tooltip>
            );
          })}
        </Stack>
        {closestUnearned?.progress && (
          <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
            {closestUnearned.progress.target -
              closestUnearned.progress.current}{" "}
            away from{" "}
            <Typography
              component="span"
              fontWeight="md"
              sx={{ color: "text.secondary" }}
            >
              {closestUnearned.label}
            </Typography>
          </Typography>
        )}
      </Stack>
    </Stack>
  );
}
