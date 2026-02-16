/**
 * Generic API budget tracking utility with per-endpoint free tier support.
 * Works with any external API service — not Google-specific.
 *
 * Each (service, endpoint) pair has its own:
 *   - free_tier_monthly_requests: number of free requests per month
 *   - monthly_budget_cents: spending cap for requests beyond the free tier
 *
 * Usage:
 *   const budget = await checkBudget("google_places", "nearby_search", 4);
 *   if (!budget.allowed) return null;
 *   // ... make API call ...
 *   await logApiUsage({ service: "google_places", endpoint: "nearby_search", costCents: budget.effectiveCostCents, ... });
 */

import { graphql } from "@cellar-assistant/shared/gql/graphql";
import {
  functionMutation,
  functionQuery,
  getAdminAuthHeaders,
} from "./urql-client";

// =============================================================================
// Types
// =============================================================================

export interface BudgetCheckResult {
  allowed: boolean;
  /** 0 if within free tier, actual cost if beyond */
  effectiveCostCents: number;
  currentSpendCents: number;
  limitCents: number;
  isEnabled: boolean;
  requestCount: number;
  freeTierLimit: number;
}

export interface LogApiUsageParams {
  service: string;
  endpoint: string;
  costCents: number;
  entityId?: string;
  entityType?: string;
  triggeredBy?: string;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// GraphQL Operations
// =============================================================================

const GET_BUDGET_CONFIG = graphql(`
  query GetBudgetConfig($service: String!, $endpoint: String!) {
    api_budget_config_by_pk(service: $service, endpoint: $endpoint) {
      service
      endpoint
      monthly_budget_cents
      free_tier_monthly_requests
      is_enabled
    }
  }
`);

const GET_MONTHLY_USAGE = graphql(`
  query GetMonthlyUsage(
    $service: String!
    $endpoint: String!
    $monthStart: timestamptz!
  ) {
    api_usage_log_aggregate(
      where: {
        service: { _eq: $service }
        endpoint: { _eq: $endpoint }
        created_at: { _gte: $monthStart }
      }
    ) {
      aggregate {
        count
        sum {
          estimated_cost_cents
        }
      }
    }
  }
`);

const INSERT_USAGE_LOG = graphql(`
  mutation InsertApiUsageLog($object: api_usage_log_insert_input!) {
    insert_api_usage_log_one(object: $object) {
      id
    }
  }
`);

// =============================================================================
// Budget Functions
// =============================================================================

/**
 * Check whether a service endpoint has budget remaining for an API call.
 * Uses per-endpoint free tier thresholds and spending caps.
 *
 * Logic:
 *   1. Count requests for this endpoint this month
 *   2. If count < free_tier → allow, effectiveCost = 0
 *   3. If count >= free_tier AND budget = 0 → deny
 *   4. If count >= free_tier AND budget > 0 → check paid spend vs budget
 */
export async function checkBudget(
  service: string,
  endpoint: string,
  estimatedCostCents: number,
): Promise<BudgetCheckResult> {
  const headers = getAdminAuthHeaders();

  try {
    const monthStart = getMonthStart();
    const [configResult, usageResult] = await Promise.all([
      functionQuery(GET_BUDGET_CONFIG, { service, endpoint }, { headers }),
      functionQuery(
        GET_MONTHLY_USAGE,
        { service, endpoint, monthStart },
        { headers },
      ),
    ]);

    const config = configResult.api_budget_config_by_pk;
    if (!config) {
      console.warn(
        `[Budget] No config found for "${service}/${endpoint}", allowing by default`,
      );
      return {
        allowed: true,
        effectiveCostCents: estimatedCostCents,
        currentSpendCents: 0,
        limitCents: 0,
        isEnabled: true,
        requestCount: 0,
        freeTierLimit: 0,
      };
    }

    if (!config.is_enabled) {
      return {
        allowed: false,
        effectiveCostCents: 0,
        currentSpendCents: 0,
        limitCents: config.monthly_budget_cents,
        isEnabled: false,
        requestCount: 0,
        freeTierLimit: config.free_tier_monthly_requests,
      };
    }

    const requestCount =
      usageResult.api_usage_log_aggregate?.aggregate?.count ?? 0;
    const currentSpend =
      usageResult.api_usage_log_aggregate?.aggregate?.sum
        ?.estimated_cost_cents ?? 0;
    const freeTier = config.free_tier_monthly_requests;

    // Within free tier — this request is free
    if (requestCount < freeTier) {
      return {
        allowed: true,
        effectiveCostCents: 0,
        currentSpendCents: currentSpend,
        limitCents: config.monthly_budget_cents,
        isEnabled: true,
        requestCount,
        freeTierLimit: freeTier,
      };
    }

    // Beyond free tier — check against paid budget
    if (config.monthly_budget_cents <= 0) {
      console.warn(
        `[Budget] "${service}/${endpoint}" free tier exhausted: ${requestCount}/${freeTier} requests (no paid budget)`,
      );
      return {
        allowed: false,
        effectiveCostCents: 0,
        currentSpendCents: currentSpend,
        limitCents: 0,
        isEnabled: true,
        requestCount,
        freeTierLimit: freeTier,
      };
    }

    const allowed =
      currentSpend + estimatedCostCents <= config.monthly_budget_cents;

    if (!allowed) {
      console.warn(
        `[Budget] "${service}/${endpoint}" budget exceeded: ${currentSpend}/${config.monthly_budget_cents} cents (+ ${estimatedCostCents} requested)`,
      );
    }

    return {
      allowed,
      effectiveCostCents: estimatedCostCents,
      currentSpendCents: currentSpend,
      limitCents: config.monthly_budget_cents,
      isEnabled: true,
      requestCount,
      freeTierLimit: freeTier,
    };
  } catch (error) {
    // On budget check failure, allow the call (graceful degradation)
    console.error(
      `[Budget] Budget check failed for "${service}/${endpoint}":`,
      error,
    );
    return {
      allowed: true,
      effectiveCostCents: estimatedCostCents,
      currentSpendCents: 0,
      limitCents: 0,
      isEnabled: true,
      requestCount: 0,
      freeTierLimit: 0,
    };
  }
}

/**
 * Log an API call to the usage log for budget tracking.
 */
export async function logApiUsage(params: LogApiUsageParams): Promise<void> {
  const headers = getAdminAuthHeaders();

  try {
    await functionMutation(
      INSERT_USAGE_LOG,
      {
        object: {
          service: params.service,
          endpoint: params.endpoint,
          estimated_cost_cents: params.costCents,
          entity_id: params.entityId ?? null,
          entity_type: params.entityType ?? null,
          triggered_by: params.triggeredBy ?? null,
          metadata: params.metadata ?? {},
        },
      },
      { headers },
    );
  } catch (error) {
    // Don't fail the main operation if logging fails
    console.error(
      `[Budget] Failed to log API usage for "${params.service}":`,
      error,
    );
  }
}

// =============================================================================
// Helpers
// =============================================================================

function getMonthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}
