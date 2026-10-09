"use client";

import { useId } from "react";
import { useQuery } from "urql";
import { FilterChip } from "@/components/app/FilterChip";
import { People } from "@/components/app/icons";
import { UserAvatar } from "@/components/app/UserAvatar";
import { MyFriendsQuery } from "@/lib/api/cellars";
import { unwrapResult } from "@/lib/api/result";

/** A friend "Who with" can offer. */
export type DrinkLogFriend = {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
};

/**
 * The viewer's friends — `preloaded` when the page already read them (the
 * bottle page does), otherwise read here when the picker first shows.
 */
export function useDrinkLogFriends(
  preloaded?: readonly DrinkLogFriend[],
  /** Hold the read (a sheet that is not open yet). */
  pause = false,
): {
  friends: readonly DrinkLogFriend[];
  /** False until the list is known (for "remembered" companions). */
  known: boolean;
  fetching: boolean;
} {
  const [{ data, fetching }] = useQuery({
    query: MyFriendsQuery,
    variables: { first: 100 },
    pause: pause || preloaded !== undefined,
  });
  if (preloaded !== undefined) {
    return { friends: preloaded, known: true, fetching: false };
  }
  const result = unwrapResult(data?.myFriends, "FriendConnection");
  return {
    friends: result.ok ? result.data.edges.map((edge) => edge.node.user) : [],
    known: result.ok,
    fetching,
  };
}

/**
 * "Who with" — friends as toggle chips. Each friend chosen gets the drink in
 * their own log (the old `bulkCheckIn` rule: friends only, all or nothing).
 * Used by the Log sheet (new and edit) and the Pour sheet's "Others…".
 */
export function CompanionPicker({
  preloaded,
  selected,
  onToggle,
  heading = "Who with",
  footnote = "Each friend gets this drink in their own log.",
}: {
  preloaded?: readonly DrinkLogFriend[];
  selected: readonly string[];
  onToggle: (id: string) => void;
  heading?: string | null;
  footnote?: string | null;
}) {
  const ids = useId();
  const { friends, fetching } = useDrinkLogFriends(preloaded);

  return (
    <section
      className="flex flex-col gap-2"
      aria-labelledby={heading === null ? undefined : `${ids}-who`}
      aria-label={heading === null ? "Friends" : undefined}
    >
      {heading !== null && (
        <h3 id={`${ids}-who`} className="type-callout font-semibold">
          {heading}
        </h3>
      )}
      {fetching && friends.length === 0 ? (
        <p className="type-footnote">Loading friends…</p>
      ) : friends.length === 0 ? (
        <p className="type-footnote flex items-center gap-2">
          <People aria-hidden className="size-4" />
          Just you. Friends you add show up here.
        </p>
      ) : (
        <ul
          aria-label={heading ?? "Friends"}
          className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1"
        >
          {friends.map((friend) => (
            <li key={friend.id}>
              <FilterChip
                selected={selected.includes(friend.id)}
                onClick={() => onToggle(friend.id)}
                icon={
                  <UserAvatar
                    avatarUrl={friend.avatarUrl}
                    displayName={friend.displayName}
                    size="sm"
                    className="-ml-2 size-6 text-[10px]"
                  />
                }
              >
                {friend.displayName}
              </FilterChip>
            </li>
          ))}
        </ul>
      )}
      {selected.length > 0 && footnote !== null && (
        <p className="type-footnote">{footnote}</p>
      )}
    </section>
  );
}
