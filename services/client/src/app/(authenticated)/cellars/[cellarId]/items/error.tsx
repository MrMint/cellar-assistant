"use client";

import { BoundaryError } from "@/components/shell/BoundaryError";

/**
 * The items grid's boundary: the same message as every other signed-in page
 * (`(authenticated)/error.tsx`) — offline wording when offline, a Reference
 * to quote — rather than its own "Failed to load cellar items" alert (UX
 * lane, 2026-10-08: the two looks disagreed).
 */
export default function CellarItemsError(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <BoundaryError {...props} />;
}
