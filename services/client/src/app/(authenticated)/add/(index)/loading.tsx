import { CaptureShell } from "@/components/capture/CaptureShell";

/**
 * The capture surface's shell (X06), scoped to `/add` by the `(index)` group.
 * Not over `/add/[itemType]`: a loading boundary there streams a 200 before
 * that page's `notFound()` for an unknown type (`00-routes.spec.ts`).
 */
export default function AddLoading() {
  return <CaptureShell />;
}
