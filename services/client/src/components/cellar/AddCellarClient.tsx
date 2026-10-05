"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useQuery } from "urql";
import { CellarForm } from "@/components/cellar/CellarForm";
import { ApiError } from "@/components/cellar-api/ApiError";
import { PageLoading } from "@/components/common/PageLoading";
import { MyFriendsQuery } from "@/lib/api/cellars";
import { unwrapResult } from "@/lib/api/result";
import { userFromProfile } from "./adapter";

/**
 * `82450ad1:src/components/cellar/AddCellarClient.tsx`, restored.
 *
 * `user(id).friends { friend }` → `myFriends` (the viewer is implicit, so no
 * `userId` prop). Same loading state, same form, and the same destination:
 * the new cellar's items page.
 */
export function AddCellarClient() {
  const router = useRouter();

  const [{ data, fetching }] = useQuery({
    query: MyFriendsQuery,
    variables: { first: 100 },
  });

  const handleSubmitted = useCallback(
    (id: string) => {
      router.push(`/cellars/${id}/items`);
      router.refresh();
    },
    [router],
  );

  if (fetching && data === undefined) return <PageLoading />;
  const friends = unwrapResult(data?.myFriends, "FriendConnection");
  if (!friends.ok) return <ApiError error={friends.error} />;

  return (
    <CellarForm
      friends={friends.data.edges.map((edge) =>
        userFromProfile(edge.node.user),
      )}
      onSubmitted={handleSubmitted}
    />
  );
}
