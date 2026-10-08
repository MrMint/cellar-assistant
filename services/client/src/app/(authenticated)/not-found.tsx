import { NotFoundMessage } from "@/components/shell/NotFoundMessage";

/**
 * Every `notFound()` thrown by a page in the signed-in group lands here, inside
 * the group's layout, so the tab bar stays. Pages call `notFound()` for a row
 * that is missing *and* for one the viewer may not see — the API answers both
 * the same way — and this says the same thing for both (D24).
 */
export default function AuthenticatedNotFound() {
  return <NotFoundMessage />;
}
