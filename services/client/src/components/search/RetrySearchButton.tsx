"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ICON_STROKE, Refresh } from "@/components/app/icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Universal search's "Try again" when no section answered: re-runs the
 * page's server render in place (the box and its text stay, N01), and shows
 * that the tap did something while it does — as `BoundaryError` does.
 */
export function RetrySearchButton() {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  return (
    <Button
      disabled={retrying}
      aria-busy={retrying || undefined}
      onClick={() => startRetry(() => router.refresh())}
    >
      {retrying ? (
        <Spinner aria-hidden />
      ) : (
        <Refresh aria-hidden strokeWidth={ICON_STROKE} />
      )}
      Try again
    </Button>
  );
}
