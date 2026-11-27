"use client";

/**
 * The Insights tab (Social-Placing 20 to 23, loading and off states).
 *
 * L12 / MC-quota: the first open of a list of 3 or more entries **writes**
 * its Insights. The owner's panel, seeing `insightsStatus: IDLE`, sends
 * `requestTierListInsights` once (`shouldRequestInsights`) — an explicit,
 * idempotent request; a read never writes — and shows the working card
 * meanwhile. A quota refusal is "Limit reached" with the reset
 * (`insightsLimitNotice`). A visitor's panel never asks.
 *
 * N07: whether the working card shows, whether the page polls, and what is
 * said instead is `insightsView`'s decision, from the server's
 * `insightsStatus` — never inferred from a missing `aiInsights`.
 *
 * Order, as the board draws it: the AI card ("Written by AI · date"), Try
 * this next (X16's grounded cards), Bands (F2b's `Histogram`), a place
 * list's Kinds, Where and Passport (F2b's `StatTile`), then what else the
 * model wrote. The sparkle and its words mark the AI, never a colour
 * (DECISIONS 40a).
 */

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AI, ICON_STROKE, Schedule } from "@/components/app/icons";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { AiStatus } from "@/components/common/AiStatus";
import { Timestamp } from "@/components/common/Timestamp";
import { Skeleton } from "@/components/ui/skeleton";
import { TryThisNext } from "@/components/want-to-try/TryThisNext";
import type { AiOutcome } from "@/lib/ai/outcome";
import { useTierListActions } from "../actions";
import { TryNextCards } from "../TryNextCards";
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
import {
  insightsLimitNotice,
  insightsView,
  shouldRequestInsights,
} from "./insights-view";
import { PalatePassport } from "./PalatePassport";

const POLL_INTERVAL_MS = 15_000;
const MAX_POLLS = 8;

/** One card of the panel: edge, r8, its title in t-head. */
function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-edge bg-card p-4">
      {title !== undefined && <h3 className="t-head mb-2 text-ink">{title}</h3>}
      {children}
    </section>
  );
}

/** "Written by AI · May 31": the sparkle and its words, in ink-2. */
function WrittenByAi({ children }: { children: ReactNode }) {
  return (
    <p className="t-cap flex items-center gap-1.5 text-ink-2">
      <AI aria-hidden strokeWidth={ICON_STROKE} className="size-4 shrink-0" />
      {children}
    </p>
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
  /**
   * X16's grounded cards: the list, and whether the viewer owns it (the
   * reasons are worded for them). Absent where the page does not offer them.
   */
  grounded?: { tierListId: string; isOwner: boolean } | null;
  /** What the entries are called ("places"), for the counts. */
  noun?: string;
}

export function TierListInsightsPanel({
  insights,
  tryNext = null,
  grounded = null,
  noun = "entries",
}: TierListInsightsPanelProps) {
  const router = useRouter();
  const pollCount = useRef(0);
  const ai = insights.aiInsights;
  const itemCount = insights.items.length;
  const isOwner = grounded?.isOwner ?? false;
  const status = insights.status ?? null;
  const { requestInsightsAction } = useTierListActions();
  /** The list this panel has already asked for: one request per list. */
  const asked = useRef<string | null>(null);
  /** The request's refusal, when it was refused (MC-quota). */
  const [refusal, setRefusal] = useState<AiOutcome | null>(null);
  const tierListId = grounded?.tierListId ?? null;

  // L12: the owner's first open of an IDLE list of 3+ writes it — once.
  useEffect(() => {
    if (tierListId === null) return;
    if (!shouldRequestInsights({ status, itemCount, isOwner })) return;
    if (asked.current === tierListId) return;
    asked.current = tierListId;
    void (async () => {
      const result = await requestInsightsAction(tierListId);
      if (result.success) {
        router.refresh();
        return;
      }
      setRefusal(insightsLimitNotice(result.failure));
    })();
  }, [isOwner, itemCount, requestInsightsAction, router, status, tierListId]);

  const computed = insightsView({
    status,
    failureReason: insights.failureReason ?? null,
    retryAt: insights.retryAt ?? null,
    hasInsights: ai !== null,
    itemCount,
    isOwner,
  });
  const view =
    refusal === null
      ? computed
      : { generating: false, poll: false, notice: refusal, hint: null };
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
      <p className="t-body py-8 text-ink-3">
        Insights start once this list has a few {noun}.
      </p>
    );
  }

  const changedSince =
    ai?.generatedAt !== undefined &&
    insights.contentUpdatedAt !== null &&
    new Date(insights.contentUpdatedAt) > new Date(ai.generatedAt);

  return (
    <div className="flex flex-col gap-4 py-2">
      {/* The AI card: working, or what it wrote */}
      {view.generating ? (
        <section
          role="status"
          aria-label="Writing insights"
          className="rounded-md border border-edge bg-card p-4"
        >
          <WrittenByAi>
            Reading {itemCount} {noun}
          </WrittenByAi>
          <div className="mt-3 flex flex-col gap-2" aria-hidden>
            <Skeleton className="h-5 w-3/5" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-11/12" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        </section>
      ) : ai !== null ? (
        <section className="flex flex-col gap-2 rounded-md border border-edge bg-card p-4">
          <WrittenByAi>
            Written by AI · <Timestamp iso={ai.generatedAt} precision="date" />
          </WrittenByAi>
          {ai.archetype && <h3 className="t-title text-ink">{ai.archetype}</h3>}
          <p className="t-body text-ink">
            {ai.archetypeDescription ?? ai.palateProfile}
          </p>
          {view.hint === null && changedSince && (
            <p className="t-cap flex items-center gap-1 text-ink-3">
              <Schedule
                aria-hidden
                strokeWidth={ICON_STROKE}
                className="size-3.5 shrink-0"
              />
              Changed since this was written
            </p>
          )}
        </section>
      ) : null}

      {/* Why there are no (new) insights, when that is the news */}
      {view.notice !== null && <AiStatus outcome={view.notice} />}
      {view.hint !== null && <p className="t-body text-ink-3">{view.hint}</p>}

      {/* Try this next — grounded catalog cards (X16). The cards draw their
          own section, so a visitor with nothing to see gets no heading. */}
      {grounded !== null && (
        <TryNextCards
          tierListId={grounded.tierListId}
          isOwner={grounded.isOwner}
          frame={(body) => <Section title="Try this next">{body}</Section>}
        />
      )}

      <Section>
        <BandDistributionChart distribution={bandDistribution} noun={noun} />
      </Section>

      {insights.showPlaceStats && categoryDistribution.length > 1 && (
        <Section>
          <CategoryDonutChart distribution={categoryDistribution} />
        </Section>
      )}

      {insights.showPlaceStats && heatmapEntries.length > 0 && (
        <Section>
          <CountryHeatmap entries={heatmapEntries} />
        </Section>
      )}

      {insights.showPlaceStats && (
        <Section>
          <PalatePassport stats={passportStats} />
        </Section>
      )}

      {ai?.archetypeDescription && ai.palateProfile && (
        <Section title="Palate profile">
          <p className="t-body text-ink">{ai.palateProfile}</p>
        </Section>
      )}

      {ai?.hotTake && (
        <Section title="Hot take">
          <blockquote className="border-edge-2 border-l-[3px] pl-3">
            <p className="t-quote text-ink">{ai.hotTake}</p>
          </blockquote>
        </Section>
      )}

      {ai?.blindSpots && (
        <Section title="To explore">
          <p className="t-body text-ink">{ai.blindSpots}</p>
        </Section>
      )}

      {/* The model's suggestion: a style, not a bottle */}
      {ai?.recommendation && (
        <Section title="A style to explore">
          <div className="flex flex-col">
            <p className="t-body text-ink">{ai.recommendation}</p>
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
    </div>
  );
}
