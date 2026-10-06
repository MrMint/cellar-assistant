"use client";

import { Stack } from "@mui/joy";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { CellarForm } from "@/components/cellar/CellarForm";
import { ApiError } from "@/components/cellar-api/ApiError";
import { PageLoading } from "@/components/common/PageLoading";
import { userFromProfile } from "./adapter";
import { useAllFriends } from "./useAllFriends";

/**
 * `82450ad1:src/components/cellar/AddCellarClient.tsx`, restored.
 *
 * `user(id).friends { friend }` → `myFriends` (the viewer is implicit, so no
 * `userId` prop), walked to its last page so the co-owner picker offers every
 * friend, as the old unbounded read did. Same loading state, same form, and
 * the same destination: the new cellar's items page.
 */
export function AddCellarClient() {
  const router = useRouter();

  const friends = useAllFriends();

  const handleSubmitted = useCallback(
    (id: string) => {
      router.push(`/cellars/${id}/items`);
      router.refresh();
    },
    [router],
  );

  if (friends.loading) return <PageLoading />;
  // A failure partway through still leaves a usable form — the friends read
  // so far — with the error above it rather than a silently short picker.
  if (friends.failure !== null && friends.rows.length === 0) {
    return <ApiError error={friends.failure} />;
  }

  const form = (
    <CellarForm
      friends={friends.rows.map(userFromProfile)}
      onSubmitted={handleSubmitted}
    />
  );
  if (friends.failure === null) return form;
  return (
    <Stack spacing={2}>
      <ApiError error={friends.failure} />
      {form}
    </Stack>
  );
}
