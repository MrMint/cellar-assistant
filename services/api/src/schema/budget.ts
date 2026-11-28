/**
 * redesign-2026-11 SV-A — MC-quota: the viewer's own AI allowance.
 *
 * `BudgetActor.myQuota` counts the viewer's calls this period per model seam
 * against the period cap `BUDGET_USER_CAPS` sets (default a UTC calendar
 * month, ten days' worth per kind). The actor keys the read by `ctx.viewerId`
 * alone, and nothing here passes a user id, so a viewer can only ever read
 * their own usage.
 *
 * F-230 (FR-16): Google Places has its own monthly allowance, separate from
 * AI, and it is one more row here — kind `google_places`, `service`
 * GOOGLE_PLACES — so a Places refusal always has a visible reason.
 *
 * A connection rather than MC-quota's `[AiQuota!]!`: §1.5/L48 allow no
 * composite list outside a connection's `edges`. One page holds every kind.
 */
import type { AiQuotaDto } from "@cellar-assistant/contracts";
import {
  BUDGET_ACTOR_ID,
  BudgetActorDescriptor,
  ForbiddenError,
} from "@cellar-assistant/contracts";
import { builder } from "./builder.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";

const AiQuotaServiceEnum = builder.enumType("AiQuotaService", {
  description:
    "F-230: which allowance a quota row is — an AI kind, or Google Places' " +
    "one monthly allowance.",
  values: {
    AI_MODEL: { value: "ai_model" },
    GOOGLE_PLACES: { value: "google_places" },
  } as const,
});

const AiQuotaType = builder.objectRef<AiQuotaDto>("AiQuota").implement({
  description:
    "Your own allowance for one kind of AI call this period (SV-A, L5), or " +
    "(F-230) for Google Places this month.",
  fields: (t) => ({
    kind: t.exposeString("kind", {
      description:
        "The budget kind, `ai_model/<seam>` — e.g. `ai_model/tier_list_insights` " +
        "— or `google_places`, every Places endpoint together (F-230).",
    }),
    service: t.field({
      type: AiQuotaServiceEnum,
      description:
        "F-230: AI_MODEL for an AI kind, GOOGLE_PLACES for Places' allowance, " +
        "which always resets monthly.",
      resolve: (quota) =>
        quota.kind.startsWith("google_places") ? "google_places" : "ai_model",
    }),
    used: t.exposeInt("used", {
      description: "Your calls counted this period.",
    }),
    limit: t.exposeInt("limit", {
      description: "The period's cap. `used >= limit` is 'Limit reached'.",
    }),
    resetsAt: t.expose("resetsAt", {
      type: "DateTime",
      description:
        "When the period resets — the same instant a USER_CAP refusal " +
        "carries as `BudgetExceededError.retryAt`.",
    }),
  }),
});

const AiQuotaConnection = builder.connectionObject(
  { type: AiQuotaType, name: "AiQuotaConnection" },
  { name: "AiQuotaEdge" },
);

builder.queryField("myAiQuota", (t) =>
  t.field({
    type: AiQuotaConnection,
    description:
      "MC-quota: how much of your AI allowance you have used this period, " +
      "per kind, and when it resets. Signed-in only; always your own.",
    // A7e — an error union, for the reason `pagination.ts` records.
    errors: {},
    args: { ...t.arg.connectionArgs() },
    resolve: async (_root, args, context) => {
      if (context.ctx.viewerId === null) {
        throw new ForbiddenError("sign in to see your AI allowance");
      }
      return connectionFromPage(
        await context
          .actor(BudgetActorDescriptor, BUDGET_ACTOR_ID)
          .myQuota(toPageArgs(args)),
      );
    },
  }),
);
