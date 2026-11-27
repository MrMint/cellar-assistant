import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "../UserAvatar";

/**
 * KIT § 3 "Activity feed item" (H1's feed): a card with the person's avatar,
 * one sentence with their name in t-head ("Maya Chen checked in Orval"), an
 * optional detail line (a thumb with stars and score, or a rank chip with the
 * crown for a new #1), and the time in t-cap. Stars here are someone else's,
 * so the caller draws them with `tone="other"` unless they are the owner's.
 * To make the item a link, put an `app/Link` with `overlay` in `sentence`.
 */
export function ActivityItem({
  who,
  avatarUrl,
  sentence,
  detail,
  time,
  className,
}: {
  /** The person's name, for the avatar's initials. */
  who: string;
  avatarUrl?: string | null;
  /** The sentence; wrap the name in `<ActivityName>`. */
  sentence: ReactNode;
  detail?: ReactNode;
  time: string;
  className?: string;
}) {
  return (
    <article
      data-slot="activity-item"
      className={cn(
        "relative flex w-full gap-3 rounded-md border border-edge bg-card px-3.5 py-3 has-[a[data-slot=link]:active]:bg-raised",
        className,
      )}
    >
      <UserAvatar avatarUrl={avatarUrl} displayName={who} size="md" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="t-body m-0 text-ink">{sentence}</p>
        {detail !== undefined && (
          <div className="flex min-w-0 items-center gap-2">{detail}</div>
        )}
      </div>
      <span className="t-cap tabular shrink-0 text-ink-3">{time}</span>
    </article>
  );
}

/** The person's name inside an activity sentence. */
export function ActivityName({ children }: { children: ReactNode }) {
  return <strong className="t-head">{children}</strong>;
}
