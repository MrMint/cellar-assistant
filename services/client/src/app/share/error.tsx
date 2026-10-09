"use client";

import { BoundaryError } from "@/components/shell/BoundaryError";

/** A share page that could not be read (the API unreachable, say). */
export default function ShareError(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <BoundaryError {...props} />
    </div>
  );
}
