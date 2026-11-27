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
        title: `${name} invited you`,
        body: "Friends see each other's shared cellars, rankings and what they've been drinking.",
      };
    case "CAN_ACCEPT":
      return {
        title: `${name} invited you to be friends`,
        body: "You'll see each other's shared cellars, rankings and logs.",
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

/**
 * What a failed "Add as a friend" says. Never the actor's own message: a link
 * reset between opening the page and tapping reads `UserActor(<id>) has no
 * row` there, which is for logs, not people.
 */
export const acceptFailureCopy = (
  name: string,
  error: { code: string },
): string => {
  switch (error.code) {
    case "NOT_FOUND":
      return `This invite link doesn't work any more. Ask ${name} for a new one.`;
    case "TRANSPORT":
      return "Couldn't reach Cellar Assistant. Check your connection and try again.";
    default:
      return `Couldn't add ${name} just now. Try again.`;
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
    <div className="flex flex-col items-center gap-3 pt-10 text-center">
      <div className="relative mb-1">
        <UserAvatar
          avatarUrl={avatarUrl}
          displayName={name}
          size="xl"
          className="size-26 text-[2.5rem]"
        />
        {friends ? (
          <span className="absolute -right-0.5 -bottom-0.5 flex size-8 items-center justify-center rounded-full bg-success text-bg ring-2 ring-bg">
            <Check aria-hidden strokeWidth={ICON_STROKE} className="size-4" />
          </span>
        ) : null}
      </div>
      <h1 className="t-title m-0 max-w-[420px] text-balance text-ink">
        {copy.title}
      </h1>
      <p className="t-body m-0 max-w-[360px] text-balance text-ink-2">
        {copy.body}
      </p>
    </div>
  );
}
