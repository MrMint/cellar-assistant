import type { Metadata } from "next";
import { NotFoundMessage } from "@/components/shell/NotFoundMessage";

// Next takes a 404's metadata from the deepest `not-found` on the path, so
// without its own export this one blanks the root's and the tab reads
// "Cellar Assistant" (UX lane, 2026-10-08).
export const metadata: Metadata = { title: "Not found · Cellar Assistant" };

/**
 * Every `notFound()` thrown by a page in the signed-in group lands here, inside
 * the group's layout, so the tab bar stays. Pages call `notFound()` for a row
 * that is missing *and* for one the viewer may not see — the API answers both
 * the same way — and this says the same thing for both (D24).
 */
export default function AuthenticatedNotFound() {
  return <NotFoundMessage />;
}
