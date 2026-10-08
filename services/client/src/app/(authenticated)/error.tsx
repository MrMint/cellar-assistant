"use client";

import { BoundaryError } from "@/components/shell/BoundaryError";

/**
 * Any error thrown while rendering a signed-in page. It sits inside the
 * group's layout, so the tab bar survives the failure and the viewer can go
 * somewhere else instead of reloading the app. (Errors in the layout itself
 * go to `global-error.tsx`.)
 */
export default function AuthenticatedError(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <BoundaryError {...props} />;
}
