"use client";

import { useEffect, useTransition } from "react";
import {
  CloudOff,
  ErrorIcon,
  ICON_STROKE,
  Refresh,
} from "@/components/app/icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { ShellMessage } from "./ShellMessage";
import { describeBoundaryError, errorReference } from "./shell-copy";

/**
 * What `error.tsx` and `global-error.tsx` render. `retry` is Next 16's: it
 * re-fetches the segment's server components and re-renders, where the older
 * `reset` only re-rendered the client tree — which, for an error thrown by a
 * server component, just threw again.
 */
export function BoundaryError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const online = useOnlineStatus();
  // `retry` refreshes in a transition; holding it in ours shows that the tap
  // did something while the server renders again (UX lane: a retry that
  // failed again left the page looking untouched).
  const [retrying, startRetry] = useTransition();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ShellMessage
      copy={describeBoundaryError({ online })}
      icon={
        online ? (
          <ErrorIcon strokeWidth={ICON_STROKE} />
        ) : (
          <CloudOff strokeWidth={ICON_STROKE} />
        )
      }
      footnote={errorReference(error.digest)}
      actions={
        <Button
          disabled={retrying}
          aria-busy={retrying || undefined}
          onClick={() => startRetry(() => retry())}
        >
          {retrying ? (
            <Spinner aria-hidden />
          ) : (
            <Refresh aria-hidden strokeWidth={ICON_STROKE} />
          )}
          Try again
        </Button>
      }
    />
  );
}
