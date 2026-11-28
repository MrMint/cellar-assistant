import { ICON_STROKE, Pending, Warning } from "@/components/app/icons";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type ReviewStatus, reviewBadge } from "./place-review";

/**
 * X27 / D28: the "Under review" / "Not approved" chip a place carries while
 * only its creator can see it. Renders nothing for a shared place, so every
 * surface can drop it in unconditionally — the place page header, the map
 * drawer, a search result.
 *
 * A status, not an action and not AI output: neutral for pending (surface,
 * not brass; teal is reserved for AI drafts), the destructive outline for a
 * rejection. Always glyph *and* words; the `aria-label` carries "only you can
 * see this", which the short label leaves implicit.
 */
export function PlaceReviewBadge({
  status,
  className,
}: {
  status: ReviewStatus | null | undefined;
  className?: string;
}) {
  const badge = reviewBadge(status);
  if (badge === null) return null;
  const Icon = badge.tone === "pending" ? Pending : Warning;
  return (
    <Badge
      variant={badge.tone === "pending" ? "secondary" : "destructive"}
      data-review-status={status}
      aria-label={badge.description}
      className={cn(
        badge.tone === "pending" && "bg-surface-2 text-ink",
        className,
      )}
    >
      <Icon aria-hidden strokeWidth={ICON_STROKE} />
      {badge.label}
    </Badge>
  );
}
