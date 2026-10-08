"use client";

import { useQuery } from "urql";
import { Skeleton } from "@/components/ui/skeleton";
import { UserNameQuery } from "@/lib/api/cellars";
import { unwrapResult } from "@/lib/api/result";

/**
 * One person's display name, by id.
 *
 * `CheckIn` carries `userId` and nothing else, so the name is a second read.
 * One query per row would be an N+1 if URQL did not deduplicate identical
 * in-flight operations and cache `UserProfile` by id — with both, a cellar
 * whose forty check-ins were left by three people performs three reads.
 *
 * A viewer who may not read the profile gets the id's first eight characters
 * rather than an error: the check-in itself is visible (the cellar is), so
 * failing the whole row over a name would be the wrong trade.
 */
export function UserName({
  userId,
  viewerId,
}: {
  userId: string;
  viewerId: string | null;
}) {
  const isViewer = userId === viewerId;
  const [{ data, fetching }] = useQuery({
    query: UserNameQuery,
    variables: { userId },
    pause: isViewer,
  });

  if (isViewer) return <p className="type-callout text-ink-1">You</p>;
  if (fetching) {
    return <Skeleton aria-hidden className="h-4 w-20" />;
  }

  const result = unwrapResult(data?.user, "UserProfile");
  return (
    <p className="type-callout text-ink-1">
      {result.ok ? result.data.displayName : userId.slice(0, 8)}
    </p>
  );
}
