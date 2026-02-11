import { graphql } from "@cellar-assistant/shared/gql/graphql";
import type { Request, Response } from "express";
import {
  functionMutation,
  functionQuery,
  getAdminAuthHeaders,
} from "../_utils/urql-client";
import { createAIProvider } from "../_utils/ai-providers/factory";
import {
  buildInsightsPrompt,
  TIER_LIST_INSIGHTS_SCHEMA,
  type TierListPlaceItem,
} from "./_prompts";
import { extractTierListId, validateEventInput } from "./_types";

const { NHOST_WEBHOOK_SECRET } = process.env;

const THROTTLE_MS = 24 * 60 * 60 * 1000; // 24 hours
const MIN_ITEMS = 3;

const GetTierListForInsightsQuery = graphql(`
  query GetTierListForInsights($id: uuid!) {
    tier_lists_by_pk(id: $id) {
      id
      name
      description
      list_type
      insights_generated_at
      items(order_by: [{ band: desc }, { position: asc }]) {
        id
        band
        position
        type
        place {
          id
          name
          display_name
          primary_category
          categories
          locality
          region
          country_code
        }
      }
    }
  }
`);

const UpdateTierListInsightsMutation = graphql(`
  mutation UpdateTierListInsights(
    $id: uuid!
    $insights: jsonb!
    $now: timestamptz!
  ) {
    update_tier_lists_by_pk(
      pk_columns: { id: $id }
      _set: { ai_insights: $insights, insights_generated_at: $now }
    ) {
      id
    }
  }
`);

export default async function generateTierListInsights(
  req: Request,
  res: Response,
) {
  try {
    if (req.method === "GET") return res.status(200).send();
    if (req.method !== "POST") return res.status(405).send();
    if (req.headers["nhost-webhook-secret"] !== NHOST_WEBHOOK_SECRET) {
      return res.status(400).send();
    }

    const input = validateEventInput(req.body);
    const tierListId = extractTierListId(input);

    console.log(
      `[generateTierListInsights] Processing tier list: ${tierListId}`,
    );

    // Early throttle check from event payload (avoids DB query when throttled)
    const payloadInsightsAt =
      input.event.data.new?.insights_generated_at ?? null;
    if (payloadInsightsAt) {
      const elapsed = Date.now() - new Date(payloadInsightsAt).getTime();
      if (elapsed < THROTTLE_MS) {
        const hoursRemaining = Math.round(
          (THROTTLE_MS - elapsed) / (60 * 60 * 1000),
        );
        console.log(
          `[generateTierListInsights] Throttled (early) — ${hoursRemaining}h remaining`,
        );
        return res.status(200).json({
          success: true,
          message: `Throttled — ${hoursRemaining}h remaining`,
        });
      }
    }

    // Fetch tier list data
    const headers = getAdminAuthHeaders();
    const data = await functionQuery(
      GetTierListForInsightsQuery,
      {
        id: tierListId,
      },
      { headers },
    );

    const tierList = data.tier_lists_by_pk;
    if (!tierList) {
      console.log(
        `[generateTierListInsights] Tier list not found: ${tierListId}`,
      );
      return res
        .status(200)
        .json({ success: true, message: "Tier list not found" });
    }

    // Only process place lists for now
    if (tierList.list_type !== "place") {
      console.log(
        `[generateTierListInsights] Skipping non-place list type: ${tierList.list_type}`,
      );
      return res.status(200).json({
        success: true,
        message: `Skipping list type: ${tierList.list_type}`,
      });
    }

    // Throttle check
    if (tierList.insights_generated_at) {
      const lastGenerated = new Date(tierList.insights_generated_at).getTime();
      const elapsed = Date.now() - lastGenerated;
      if (elapsed < THROTTLE_MS) {
        const hoursRemaining = Math.round(
          (THROTTLE_MS - elapsed) / (60 * 60 * 1000),
        );
        console.log(
          `[generateTierListInsights] Throttled — ${hoursRemaining}h until next generation`,
        );
        return res.status(200).json({
          success: true,
          message: `Throttled — ${hoursRemaining}h remaining`,
        });
      }
    }

    // Filter to place items only
    const placeItems: TierListPlaceItem[] = tierList.items
      .filter((item) => item.place != null)
      .map((item) => ({
        name: item.place?.display_name ?? item.place?.name ?? "Unknown",
        band: item.band,
        position: item.position,
        countryCode: item.place?.country_code ?? null,
        region: item.place?.region ?? null,
        locality: item.place?.locality ?? null,
        primaryCategory: item.place?.primary_category ?? null,
        categories: (item.place?.categories as string[] | null) ?? null,
      }));

    // Minimum items check
    if (placeItems.length < MIN_ITEMS) {
      console.log(
        `[generateTierListInsights] Too few items (${placeItems.length}/${MIN_ITEMS})`,
      );
      return res.status(200).json({
        success: true,
        message: `Not enough items (${placeItems.length}/${MIN_ITEMS})`,
      });
    }

    // Generate AI insights
    console.log(
      `[generateTierListInsights] Generating insights for ${placeItems.length} places`,
    );

    const aiProvider = await createAIProvider();
    const prompt = buildInsightsPrompt(placeItems, {
      name: tierList.name,
      description: tierList.description ?? null,
    });

    const aiResponse = await aiProvider.generateContent(
      { prompt, schema: TIER_LIST_INSIGHTS_SCHEMA },
      "medium",
    );

    const parsed = JSON.parse(aiResponse.content) as {
      palateProfile: string;
      blindSpots: string;
      hotTake: string;
      archetype: string;
      archetypeDescription: string;
      recommendation: string;
    };

    const now = new Date().toISOString();
    const insights = {
      palateProfile: parsed.palateProfile,
      blindSpots: parsed.blindSpots,
      hotTake: parsed.hotTake,
      archetype: parsed.archetype,
      archetypeDescription: parsed.archetypeDescription,
      recommendation: parsed.recommendation,
      generatedAt: now,
    };

    // Store results
    await functionMutation(
      UpdateTierListInsightsMutation,
      {
        id: tierListId,
        insights,
        now,
      },
      { headers },
    );

    console.log(
      `[generateTierListInsights] Insights stored for tier list: ${tierListId}`,
    );

    return res.status(200).json({
      success: true,
      tierListId,
      message: "Insights generated successfully",
    });
  } catch (error) {
    console.error("[generateTierListInsights] Error:", error);
    return res.status(500).json({
      success: false,
      message:
        error instanceof Error ? error.message : "Unknown error occurred",
    });
  }
}
