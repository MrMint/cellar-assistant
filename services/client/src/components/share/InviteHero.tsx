import { Check, ICON_STROKE } from "@/components/app/icons";
import { UserAvatar } from "@/components/app/UserAvatar";

export type InviteStatus =
  | "SIGNED_OUT"
  | "OWN_INVITE"
  | "ALREADY_FRIENDS"
  | "CAN_ACCEPT";

/** What an invite page shows: the API's status, or the one it just made. */
export type InviteState = InviteStatus | "ACCEPTED";

/** The words for each state, in one place so they can be tested. */
export const inviteCopy = (
  name: string,
  state: InviteState,
): { title: string; body: string } => {
  switch (state) {
    case "SIGNED_OUT":
      return {
        title: `${name} invited you to Cellar Assistant`,
        body: `Join to become friends with ${name} and see each other's cellars, rankings and what you've been drinking.`,
      };
    case "CAN_ACCEPT":
      return {
        title: `${name} invited you to be friends`,
        body: "You'll see each other's shared cellars, rankings and check-ins.",
      };
    case "ALREADY_FRIENDS":
      return {
        title: `You and ${name} are already friends`,
        body: "Nothing to do here.",
      };
    case "ACCEPTED":
      return {
        title: `You and ${name} are friends`,
        body: "Their shared cellars and rankings are yours to browse now.",
      };
    case "OWN_INVITE":
      return {
        title: "This is your invite link",
        body: "Send it to a friend. Whoever opens it can add you, no searching needed.",
      };
  }
};

/** The inviter's face and the sentence about them — no hooks, server-safe. */
export function InviteHero({
  name,
  avatarUrl,
  state,
}: {
  name: string;
  avatarUrl: string | null;
  state: InviteState;
}) {
  const copy = inviteCopy(name, state);
  const friends = state === "ACCEPTED" || state === "ALREADY_FRIENDS";
  return (
    <div className="flex flex-col items-center gap-4 pt-6 text-center">
      <div className="relative">
        <UserAvatar
          avatarUrl={avatarUrl}
          displayName={name}
          size="lg"
          className="size-20 text-3xl"
        />
        {friends ? (
          <span className="absolute -right-1 -bottom-1 flex size-7 items-center justify-center rounded-full bg-success text-background ring-2 ring-background">
            <Check aria-hidden strokeWidth={ICON_STROKE} className="size-4" />
          </span>
        ) : null}
      </div>
      <h1 className="type-title-1 max-w-[420px] font-display text-ink-1">
        {copy.title}
      </h1>
      <p className="type-body max-w-[420px] text-ink-2">{copy.body}</p>
    </div>
  );
}
