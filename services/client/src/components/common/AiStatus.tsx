"use client";

import { useEffect, useState } from "react";
import { AI, ErrorIcon, Schedule } from "@/components/app/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type {
  AiFailureLike,
  AiOutcome,
  AiOutcomeOptions,
} from "@/lib/ai/outcome";
import { aiOutcome } from "@/lib/ai/outcome";
import { cn } from "@/lib/utils";

/**
 * One AI outcome, rendered (N07). The words come from `aiOutcome` in
 * `lib/ai/outcome.ts`; this only lays them out, so the shadcn migration swaps
 * this file and nothing else.
 *
 * A limit is never `danger` — nothing is broken: it reads in calm ink with a
 * clock (there is no amber in the palette), and only a real failure takes the
 * danger hue. `data-tone` carries the outcome's tone for tests and styling.
 */
export function AiStatus({
  outcome,
  onRetry,
}: {
  outcome: AiOutcome;
  /** Shown only when the outcome says retrying the same input can work. */
  onRetry?: () => void;
}) {
  const Icon =
    outcome.kind === "user-cap" || outcome.kind === "service-budget"
      ? Schedule
      : outcome.tone === "danger"
        ? ErrorIcon
        : AI;
  const danger = outcome.tone === "danger";
  return (
    <Alert
      variant={danger ? "destructive" : "default"}
      data-tone={outcome.tone}
      className={cn(
        "border-transparent bg-surface-2",
        danger && "border-destructive/60",
      )}
    >
      <Icon aria-hidden />
      <AlertTitle className="line-clamp-none">{outcome.title}</AlertTitle>
      <AlertDescription className={danger ? undefined : "text-ink-2"}>
        {outcome.message}
      </AlertDescription>
      {outcome.canRetry && onRetry !== undefined && (
        <Button
          variant="ghost"
          className="col-start-2 -ml-3 justify-self-start text-ink-1"
          onClick={onRetry}
        >
          Try again
        </Button>
      )}
    </Alert>
  );
}

/**
 * {@link AiStatus} for a failure a **server component** got, so its `retryAt`
 * is phrased in the viewer's zone rather than the server's.
 *
 * A server component that phrased it itself would say "after 3:40 PM" in the
 * container's zone (UTC on `cellar-stack-client-1`) — hours off for anyone
 * else. Phrasing it during render on both sides would trip hydration the way
 * `Timestamp` documents. So the first render (server, and the hydration pass)
 * leaves the time out — "try again a little later" — and the viewer's own
 * time replaces it after mount.
 *
 * Takes the failure's three classifying fields only: the server's `message`
 * is never handed to a client component, so it is not even in the payload.
 */
export function AiFailureStatus({
  failure,
  title,
  fallback,
  subject,
}: {
  failure: AiFailureLike;
  /** Replaces the outcome's own title, for a surface that names itself. */
  title?: string;
  fallback?: AiOutcomeOptions["fallback"];
  subject?: AiOutcomeOptions["subject"];
}) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const outcome = aiOutcome(
    {
      code: failure.code,
      reason: failure.reason,
      retryAt: now === null ? null : (failure.retryAt ?? null),
    },
    {
      ...(fallback === undefined ? {} : { fallback }),
      ...(subject === undefined ? {} : { subject }),
      ...(now === null ? {} : { now }),
    },
  );
  return (
    <AiStatus outcome={title === undefined ? outcome : { ...outcome, title }} />
  );
}
