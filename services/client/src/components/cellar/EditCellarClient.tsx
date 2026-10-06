"use client";

import { Stack } from "@mui/joy";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import {
  CellarForm,
  type Permission_Type_Enum,
} from "@/components/cellar/CellarForm";
import { ApiError } from "@/components/cellar-api/ApiError";
import { DeleteCellarButton } from "@/components/cellar-api/DeleteCellarButton";
import { PageLoading } from "@/components/common/PageLoading";
import { editCoOwnerOptions } from "./adapter";
import { useAllFriends } from "./useAllFriends";

type Profile = { id: string; displayName: string; avatarUrl?: string | null };

interface EditCellarClientProps {
  cellar: {
    id: string;
    name: string;
    privacy: Permission_Type_Enum;
    createdById: string;
    coOwnerIds: readonly string[];
    coOwners: readonly Profile[];
    itemCount: number;
  };
  viewer: Profile | null;
}

/**
 * `82450ad1:src/components/cellar/EditCellarClient.tsx`, restored.
 *
 * The cellar now arrives from the server page (which also gates on
 * ownership), and the friends from `myFriends`, walked to its last page (the
 * old read was unbounded); the options rule is `editCoOwnerOptions`, which
 * also keeps every current co-owner selectable whether or not they are among
 * the friends. Kept from the rewrite: the creator-only
 * `DeleteCellarButton` under the form — the old app had no way to delete a
 * cellar at all. Destination unchanged: `/cellars`.
 */
export const EditCellarClient = ({ cellar, viewer }: EditCellarClientProps) => {
  const router = useRouter();

  const friends = useAllFriends();

  const handleSubmitted = useCallback(() => {
    router.push(`/cellars`);
    router.refresh();
  }, [router]);

  if (friends.loading) return <PageLoading />;
  if (friends.failure !== null && friends.rows.length === 0) {
    return <ApiError error={friends.failure} />;
  }

  const isCreator = viewer !== null && viewer.id === cellar.createdById;

  return (
    <Stack spacing={2}>
      {friends.failure !== null && <ApiError error={friends.failure} />}
      <CellarForm
        id={cellar.id}
        defaults={{
          name: cellar.name,
          privacy: cellar.privacy,
          co_owners: [...cellar.coOwnerIds],
        }}
        friends={editCoOwnerOptions({
          friends: friends.rows,
          viewer,
          createdById: cellar.createdById,
          coOwners: cellar.coOwners,
        })}
        onSubmitted={handleSubmitted}
      />
      {isCreator && (
        <Stack direction="row" alignItems="center">
          <DeleteCellarButton
            cellarId={cellar.id}
            cellarName={cellar.name}
            itemCount={cellar.itemCount}
          />
        </Stack>
      )}
    </Stack>
  );
};
