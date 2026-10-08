"use client";

import { Button } from "@mui/joy";
import { useEffect, useTransition } from "react";
import { MdCloudOff, MdErrorOutline, MdRefresh } from "react-icons/md";
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
      icon={online ? <MdErrorOutline /> : <MdCloudOff />}
      footnote={errorReference(error.digest)}
      actions={
        <Button
          startDecorator={<MdRefresh />}
          loading={retrying}
          onClick={() => startRetry(() => retry())}
        >
          Try again
        </Button>
      }
    />
  );
}
