"use client";

/**
 * The passport: three counted stats, then the badges (earned first, the
 * locked ones dimmed) and the nearest one still to earn. On the app's
 * primitives (D20): tonal tiles, `ui/badge` chips whose description is a
 * hover tooltip (on touch the badge's word stands alone, as before), and the
 * count-up is motion's `animate` on the long token, skipped under reduced
 * motion.
 */

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  type AppIcon,
  Category,
  ICON_STROKE,
  Layers,
  MapIcon,
  Place,
  Public,
  Star,
  ThumbsDown,
  Trending,
} from "@/components/app/icons";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { tween } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { formatPlaceCategory } from "@/utilities/formatters";
import type { PalatePassportStats } from "./computeInsightsStats";

const BADGE_ICONS: Record<string, AppIcon> = {
  globe: Public,
  category: Category,
  star: Star,
  layers: Layers,
  pin: Place,
  "thumbs-down": ThumbsDown,
};

function AnimatedNumber({ value }: { value: number }) {
  const reduceMotion = useReducedMotion() ?? false;
  const displayRef = useRef(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const from = displayRef.current;
    const to = value;
    if (from === to) return;

    if (to === 0 || reduceMotion) {
      displayRef.current = to;
      setDisplay(to);
      return;
    }

    const controls = animate(from, to, {
      ...tween("long", "enter"),
      onUpdate: (latest) => {
        const current = Math.round(latest);
        displayRef.current = current;
        setDisplay(current);
      },
    });
    return () => controls.stop();
  }, [value, reduceMotion]);

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
      icon: Public,
    },
    {
      label: "Regions",
      value: stats.uniqueRegions,
      detail: undefined,
      icon: MapIcon,
    },
    {
      label: "Categories",
      value: stats.uniqueCategories,
      detail: stats.topCategory
        ? `Top: ${formatPlaceCategory(stats.topCategory)}`
        : undefined,
      icon: Category,
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
    <div className="flex flex-col gap-4">
      <h4 className="text-ink-1 type-headline">Palate Passport</h4>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {statCards.map((stat) => {
          const StatIcon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-md bg-surface-2 p-3 shadow-[inset_0_1px_0_var(--ca-highlight)]"
            >
              <div className="flex items-center gap-2">
                <StatIcon
                  aria-hidden
                  strokeWidth={ICON_STROKE}
                  className="size-5 shrink-0 text-ink-3"
                />
                <div>
                  <p className="tabular text-ink-1 type-title-2">
                    <AnimatedNumber value={stat.value} />
                  </p>
                  <p className="text-ink-2 type-footnote">{stat.label}</p>
                </div>
              </div>
              {stat.detail && (
                <p className="mt-1 type-footnote">{stat.detail}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Badges — earned + locked */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1 text-ink-2">
          <Trending aria-hidden strokeWidth={ICON_STROKE} className="size-4" />
          <h5 className="font-medium type-callout">Badges</h5>
        </div>
        <ul className="flex flex-wrap gap-2">
          {[...earnedBadges, ...unearnedBadges].map((badge) => {
            const BadgeIcon = BADGE_ICONS[badge.icon];
            return (
              <li key={badge.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      // Focusable, so a keyboard reaches the description too.
                      tabIndex={0}
                      data-earned={badge.earned ? "true" : "false"}
                      variant={badge.earned ? "secondary" : "outline"}
                      className={cn(
                        "h-7 px-2.5 text-[13px] [&>svg]:size-3.5",
                        badge.earned
                          ? "bg-success/15 text-success"
                          : "text-ink-2 opacity-45",
                      )}
                    >
                      {BadgeIcon && (
                        <BadgeIcon aria-hidden strokeWidth={ICON_STROKE} />
                      )}
                      {badge.label}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>{badge.description}</TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ul>
        {closestUnearned?.progress && (
          <p className="type-footnote">
            {closestUnearned.progress.target - closestUnearned.progress.current}{" "}
            away from{" "}
            <span className="font-medium text-ink-2">
              {closestUnearned.label}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
