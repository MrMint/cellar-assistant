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
 *
 * On the app's primitives (D20): tonal sections (no borders), the archetype
 * on a claret hero wash, the AI-working state in teal (`--ca-ai`, the one
 * place it belongs), `ui/skeleton` lines.
 */

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import {
  AI,
  type AppIcon,
  Explore,
  ICON_STROKE,
  Person,
  Popular,
  Restaurant,
  Schedule,
} from "@/components/app/icons";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { AiStatus } from "@/components/common/AiStatus";
import { Timestamp } from "@/components/common/Timestamp";
import { Skeleton } from "@/components/ui/skeleton";
import { TryThisNext } from "@/components/want-to-try/TryThisNext";
import { cn } from "@/lib/utils";
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

/** One tonal block of the panel (design §3.3: surface-1, no border). */
function Section({
  title,
  icon: Icon,
  iconClassName,
  children,
}: {
  title?: string;
  icon?: AppIcon;
  iconClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg bg-surface-1 p-4">
      {title !== undefined && (
        <div className="mb-2 flex items-center gap-2">
          {Icon !== undefined && (
            <Icon
              aria-hidden
              strokeWidth={ICON_STROKE}
              className={cn("size-[18px] shrink-0 text-ink-2", iconClassName)}
            />
          )}
          <h4 className="font-semibold text-ink-1 type-callout">{title}</h4>
        </div>
      )}
      {children}
    </section>
  );
}

interface TierListInsightsPanelProps {
  insights: TierListInsightsData;
  /**
   * X08: for an item list, "Try This Next" can look its suggestion up in the
   * catalog and save a bottle to Want to try. Absent for a place list (the
   * suggestion there is a kind of venue, and there is no venue search by
   * style), or where the page does not offer it.
   */
  tryNext?: { itemType: ApiItemType; onList: ReadonlySet<string> } | null;
}

export function TierListInsightsPanel({
  insights,
  tryNext = null,
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
      <p className="py-8 text-ink-3 type-callout">
        Add items to your tier list to see insights.
      </p>
    );
  }

  const isGenerating = view.generating;

  return (
    <div className="flex flex-col gap-4 py-2">
      {/* Archetype Hero */}
      {ai?.archetype && (
        <section className="flex flex-col items-center gap-1 rounded-lg bg-brand/25 px-4 py-5 text-center">
          <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand px-4 font-semibold text-ink-1 type-callout">
            <Person aria-hidden strokeWidth={ICON_STROKE} className="size-4" />
            {ai.archetype}
          </span>
          {ai.archetypeDescription && (
            <p className="mt-2 max-w-[360px] text-ink-2 type-callout">
              {ai.archetypeDescription}
            </p>
          )}
        </section>
      )}

      {/* Why there are no (new) insights, when that is the news */}
      {view.notice !== null && <AiStatus outcome={view.notice} />}
      {view.hint !== null && (
        <p className="text-ink-3 type-callout">{view.hint}</p>
      )}

      {/* Generating indicator */}
      {isGenerating && (
        <Section title="Generating Insights" icon={AI} iconClassName="text-ai">
          <div className="flex flex-col gap-2 py-1" aria-hidden>
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-3/5" />
          </div>
          <p className="mt-2 type-footnote">
            Your personalized insights are being generated...
          </p>
        </Section>
      )}

      {/* Band Distribution */}
      <Section>
        <BandDistributionChart distribution={bandDistribution} />
      </Section>

      {/* Category Donut */}
      {insights.showPlaceStats && categoryDistribution.length > 1 && (
        <Section>
          <CategoryDonutChart distribution={categoryDistribution} />
        </Section>
      )}

      {/* Hot Take */}
      {ai?.hotTake && (
        <Section title="Hot Take" icon={Popular}>
          <blockquote className="border-ink-3/60 border-l-[3px] pl-3">
            <p className="text-ink-1 italic type-callout">{ai.hotTake}</p>
          </blockquote>
        </Section>
      )}

      {/* Palate Passport */}
      {insights.showPlaceStats && (
        <Section>
          <PalatePassport stats={passportStats} />
        </Section>
      )}

      {/* Country Heatmap */}
      {insights.showPlaceStats && heatmapEntries.length > 0 && (
        <Section>
          <CountryHeatmap entries={heatmapEntries} />
        </Section>
      )}

      {/* Palate Profile */}
      {ai && (
        <Section title="Palate Profile" icon={AI}>
          <p className="text-ink-1 type-callout">{ai.palateProfile}</p>
        </Section>
      )}

      {/* Blind Spots */}
      {ai?.blindSpots && (
        <Section title="Blind Spots" icon={Explore}>
          <p className="text-ink-1 type-callout">{ai.blindSpots}</p>
        </Section>
      )}

      {/* Try This Next */}
      {ai?.recommendation && (
        <Section title="Try This Next" icon={Restaurant}>
          <div className="flex flex-col">
            <p className="text-ink-1 type-callout">{ai.recommendation}</p>
            {tryNext !== null && (
              <TryThisNext
                recommendation={ai.recommendation}
                itemType={tryNext.itemType}
                onList={tryNext.onList}
              />
            )}
          </div>
        </Section>
      )}

      {/* Footer */}
      {ai?.generatedAt && (
        <div className="flex flex-col gap-1">
          <p className="type-footnote">
            Last analyzed: <Timestamp iso={ai.generatedAt} precision="date" />
          </p>
          {view.hint === null &&
            insights.contentUpdatedAt &&
            new Date(insights.contentUpdatedAt) > new Date(ai.generatedAt) && (
              <p className="flex items-center gap-1 text-ink-2 type-footnote">
                <Schedule
                  aria-hidden
                  strokeWidth={ICON_STROKE}
                  className="size-3.5 shrink-0"
                />
                This list has changed since this analysis.
              </p>
            )}
        </div>
      )}
    </div>
  );
}
