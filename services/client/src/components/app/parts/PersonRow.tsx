import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, ICON_STROKE } from "../icons";
import { UserAvatar } from "../UserAvatar";

/** The tag on a sample person's row (amendments: "a Sample tag"). */
export function SampleTag({ className }: { className?: string }) {
  return (
    <span
      data-slot="sample-tag"
      className={cn(
        "t-micro shrink-0 rounded-sm border border-edge px-1.5 py-0.5 text-ink-2",
        className,
      )}
    >
      Sample
    </span>
  );
}

/**
 * KIT § 3 "Person row": 56 minimum, a 40 avatar, the name (t-head) over
 * their relation in t-cap ("Friend", "Wants to be friends"). A friend's row
 * ends in a chevron (`chevron`); a request ends in its actions (`actions`:
 * a quiet-muted "Decline" then an outlined "Accept", per CROSS-LOT "actions
 * inside a row are secondary"). To make the row a link, put an `app/Link`
 * with `overlay` in `name`.
 */
export function PersonRow({
  name,
  displayName,
  avatarUrl,
  status,
  sample = false,
  chevron = false,
  actions,
  className,
}: {
  name: ReactNode;
  /** The name for the avatar's initials (when `name` is a link). */
  displayName: string;
  avatarUrl?: string | null;
  status?: string;
  sample?: boolean;
  chevron?: boolean;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="person-row"
      className={cn("relative flex min-h-14 items-center gap-3", className)}
    >
      <UserAvatar avatarUrl={avatarUrl} displayName={displayName} size="md" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 items-center gap-2">
          <span className="t-head min-w-0 truncate text-ink">{name}</span>
          {sample && <SampleTag />}
        </div>
        {status !== undefined && (
          <span className="t-cap truncate text-ink-2">{status}</span>
        )}
      </div>
      {actions !== undefined && (
        <div className="relative z-10 flex shrink-0 items-center gap-1">
          {actions}
        </div>
      )}
      {chevron && (
        <ChevronRight
          aria-hidden
          strokeWidth={ICON_STROKE}
          className="size-5 shrink-0 text-ink-3"
        />
      )}
    </div>
  );
}
