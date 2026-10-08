"use client";

import { Alert, Button, Typography } from "@mui/joy";
import { MdAutoAwesome, MdErrorOutline, MdSchedule } from "react-icons/md";
import type { AiOutcome } from "@/lib/ai/outcome";

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
        <Typography level="body-sm">{outcome.message}</Typography>
      </div>
    </Alert>
  );
}
