import { MapShell } from "@/components/map/core/MapShell";

/**
 * The Map tab's shell (X24): the canvas surface and the search panel, where
 * the old route held the previous page and then cut to a full-screen
 * spinner. In the `(canvas)` group so it covers `/map` only, not the scans
 * list or the create-place form under it.
 */
export default function MapLoading() {
  return <MapShell />;
}
