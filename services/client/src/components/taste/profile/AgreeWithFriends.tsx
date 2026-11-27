/**
 * "Agree with friends · within ½ star" (Social-Recap board 20): a row per
 * friend with their agreement as cells and "a of n", opening the compare on
 * their profile (S1's, `/users/<id>#compare`). Below the server's gate the
 * row says only how much you share. No friends: the kit empty state with a
 * way to add one; a failed read: what happened and Try again.
 */
import { AGREEMENT_MIN_SHARED } from "@cellar-assistant/contracts/taste";
import { EmptyState, ErrorState } from "@/components/app/EmptyState";
import { ChevronRight, ICON_STROKE, PersonAdd } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { UserAvatar } from "@/components/app/UserAvatar";
import { InviteFriendButton } from "@/components/friend/InviteFriendButton";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { type AgreementCounts, agreementCells } from "../taste-lines";
import { ProfileSection } from "./ProfileSections";

export type FriendAgreement = {
  readonly userId: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly counts: AgreementCounts;
};

export function AgreeWithFriends({
  friends,
  onRetry,
  primary,
}: {
  /** `null` when the read failed. */
  friends: readonly FriendAgreement[] | null;
  onRetry: () => void;
  /** Whether Add friend is the screen's primary (no other primary shown). */
  primary: boolean;
}) {
  if (friends === null) {
    return (
      <ProfileSection title="Agree with friends">
        <ErrorState
          title="Couldn’t load friends"
          action={
            <Button variant="outline" onClick={onRetry}>
              Try again
            </Button>
          }
        />
      </ProfileSection>
    );
  }
  if (friends.length === 0) {
    return (
      <ProfileSection title="Agree with friends">
        <EmptyState
          illustration={<PersonAdd aria-hidden strokeWidth={ICON_STROKE} />}
          title="No friends to compare yet"
          action={
            primary ? (
              <InviteFriendButton />
            ) : (
              <Link
                href="/friends"
                underline="none"
                onPointerDown={() => feedback("press", { phase: "down" })}
                onPointerUp={() => feedback("press", { phase: "up" })}
                className={cn(buttonVariants({ variant: "outline" }), "t-head")}
              >
                Add friend
              </Link>
            )
          }
        />
      </ProfileSection>
    );
  }
  return (
    <ProfileSection title="Agree with friends" unit="within ½ star">
      {friends.map((friend) => (
        <FriendRow key={friend.userId} friend={friend} />
      ))}
    </ProfileSection>
  );
}

function FriendRow({ friend }: { friend: FriendAgreement }) {
  const grid = agreementCells(friend.counts);
  const label =
    grid === null
      ? `Compare with ${friend.name}, not enough in common yet`
      : `Compare with ${friend.name}, you agree on ${grid.line}`;
  return (
    <Link
      href={`/users/${friend.userId}#compare`}
      underline="none"
      aria-label={label}
      onClick={() => feedback("tick")}
      className="flex min-h-16 items-center gap-3 px-4 py-2 text-ink-1 not-first:border-hair not-first:border-t active:bg-sel"
    >
      <UserAvatar
        aria-hidden
        avatarUrl={friend.avatarUrl}
        displayName={friend.name}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="t-body truncate">{friend.name}</span>
        {grid === null ? (
          <span className="t-cap text-ink-2">
            Not enough in common yet ({friend.counts.shared} of{" "}
            {AGREEMENT_MIN_SHARED})
          </span>
        ) : (
          <span aria-hidden className="flex flex-wrap gap-1">
            {grid.cells.map((lit, k) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: cells are positions
                key={k}
                className={cn(
                  "h-2 w-3.5 rounded-[2px]",
                  lit ? "bg-ink-2" : "bg-raised",
                )}
              />
            ))}
          </span>
        )}
      </span>
      {grid !== null && (
        <span className="t-cap tabular text-ink-2">{grid.line}</span>
      )}
      <ChevronRight
        aria-hidden
        strokeWidth={ICON_STROKE}
        className="size-5 shrink-0 text-glyph"
      />
    </Link>
  );
}
