"use client";

import { useQuery } from "urql";
import { ErrorState } from "@/components/app/EmptyState";
import { friendProfileView } from "@/components/profile/adapter";
import {
  FriendProfileBody,
  FriendProfileSkeleton,
} from "@/components/profile/FriendProfile";
import {
  FriendProfileQuery,
  PROFILE_LOG_PAGE_SIZE,
  PROFILE_SECTION_SIZE,
} from "@/components/profile/queries";
import { CompareColumn } from "@/components/taste/compare/CompareColumn";
import { Button } from "@/components/ui/button";
import { unwrapResult } from "@/lib/api/result";

/**
 * The desktop Friends pane (Social-Friends-desktop 02 to 06): the chosen
 * friend's profile, then the compare column beside it. The same body the
 * `/users/[id]` page draws, read here through the same gated query, so it
 * shows exactly what that page would. Keyed by the friend, so each opens
 * fresh.
 */
export function FriendPane({
  userId,
  onRemoved,
}: {
  userId: string;
  onRemoved: () => void;
}) {
  const [{ data, fetching, error }, reexecute] = useQuery({
    query: FriendProfileQuery,
    variables: {
      userId,
      sections: PROFILE_SECTION_SIZE,
      logs: PROFILE_LOG_PAGE_SIZE,
    },
  });
  if (data === undefined) {
    if (fetching || error === undefined) return <FriendProfileSkeleton />;
  }
  const result =
    data === undefined
      ? undefined
      : unwrapResult(data.friendProfile, "FriendProfile");
  if (result === undefined || !result.ok) {
    return (
      <ErrorState
        title="Can’t open this profile"
        action={
          <Button
            variant="ghost"
            onClick={() => reexecute({ requestPolicy: "network-only" })}
          >
            Try again
          </Button>
        }
      />
    );
  }
  const view = friendProfileView(result.data);
  return (
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:items-start">
      <FriendProfileBody view={view} headingLevel={2} onRemoved={onRemoved} />
      <CompareColumn
        userId={view.userId}
        name={view.name}
        className="lg:sticky lg:top-4"
      />
    </div>
  );
}
