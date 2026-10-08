"use client";

import { Button } from "@mui/joy";
import { useEffect } from "react";
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

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ShellMessage
      copy={describeBoundaryError({ online })}
      icon={online ? <MdErrorOutline /> : <MdCloudOff />}
      footnote={errorReference(error.digest)}
      actions={
        <Button startDecorator={<MdRefresh />} onClick={() => retry()}>
          Try again
        </Button>
      }
    />
  );
}
