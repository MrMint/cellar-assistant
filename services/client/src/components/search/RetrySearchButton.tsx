"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Search's "Try again": re-runs the page's server render in place (the box
 * and its text stay, N01), and shows that the tap did something while it
 * does. Outlined in an error face (KIT § 2: one way out); `quiet` inside
 * the partial-failure row, where it is not the screen's job.
 */
export function RetrySearchButton({ quiet = false }: { quiet?: boolean }) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  return (
    <Button
      variant={quiet ? "quiet" : "outline"}
      className="min-w-11"
      disabled={retrying}
      aria-busy={retrying || undefined}
      onClick={() => startRetry(() => router.refresh())}
    >
      {retrying && <Spinner aria-hidden />}
      Try again
    </Button>
  );
}
