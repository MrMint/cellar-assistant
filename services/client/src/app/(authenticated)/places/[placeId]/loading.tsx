import { PlaceDetailsShell } from "@/components/map/places/PlaceDetailsShell";

/**
 * A place page's shell (X24). The 404 for a missing place is decided by this
 * segment's `layout.tsx`, outside this boundary — a `notFound()` thrown
 * inside it would arrive after the response had gone out as a 200.
 */
export default function PlaceLoading() {
  return <PlaceDetailsShell />;
}
