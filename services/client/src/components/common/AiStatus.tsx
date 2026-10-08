"use client";

import { Alert, Button, Typography } from "@mui/joy";
import { useEffect, useState } from "react";
import { MdAutoAwesome, MdErrorOutline, MdSchedule } from "react-icons/md";
import type {
  AiFailureLike,
  AiOutcome,
  AiOutcomeOptions,
} from "@/lib/ai/outcome";
import { aiOutcome } from "@/lib/ai/outcome";

/**
 * One AI outcome, rendered (N07). The words come from `aiOutcome` in
 * `lib/ai/outcome.ts`; this only lays them out, so the shadcn migration swaps
 * this file and nothing else. Deliberately plain Joy: no new primitive.
 *
 * A limit is a `warning` (amber), never `danger` — nothing is broken.
 */
export function AiStatus({
  outcome,
  onRetry,
}: {
  outcome: AiOutcome;
  /** Shown only when the outcome says retrying the same input can work. */
  onRetry?: () => void;
}) {
  const icon =
    outcome.kind === "user-cap" || outcome.kind === "service-budget" ? (
      <MdSchedule />
    ) : outcome.tone === "danger" ? (
      <MdErrorOutline />
    ) : (
      <MdAutoAwesome />
    );
  return (
    <Alert
      color={outcome.tone}
      variant="soft"
      startDecorator={icon}
      sx={{ alignItems: "flex-start" }}
      endDecorator={
        outcome.canRetry && onRetry !== undefined ? (
          <Button size="sm" variant="plain" color="neutral" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    >
      <div>
        <Typography level="title-sm">{outcome.title}</Typography>
        {/* The alert's own soft colour: body-sm's default tertiary text was
            muted lavender on a dark amber in a limit notice. */}
        <Typography level="body-sm" sx={{ color: "inherit" }}>
          {outcome.message}
        </Typography>
      </div>
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
