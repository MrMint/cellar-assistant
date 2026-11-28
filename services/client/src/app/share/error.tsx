"use client";

import { MainContent } from "@/components/app/main-content";
import { BoundaryError } from "@/components/shell/BoundaryError";

/** A share page that could not be read (the API unreachable, say). */
export default function ShareError(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    // No ShareFrame around an error: this is the page's main (X21).
    <MainContent className="flex min-w-0 flex-1 flex-col">
      <BoundaryError {...props} />
    </MainContent>
  );
}
