"use client";

import { Stack } from "@mui/joy";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useQuery } from "urql";
import {
  CellarForm,
  type Permission_Type_Enum,
} from "@/components/cellar/CellarForm";
import { ApiError } from "@/components/cellar-api/ApiError";
import { DeleteCellarButton } from "@/components/cellar-api/DeleteCellarButton";
import { PageLoading } from "@/components/common/PageLoading";
import { MyFriendsQuery } from "@/lib/api/cellars";
import { unwrapResult } from "@/lib/api/result";
import { editCoOwnerOptions } from "./adapter";

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
 * ownership), and the friends from `myFriends`; the options rule is
 * `editCoOwnerOptions`. Kept from the rewrite: the creator-only
 * `DeleteCellarButton` under the form — the old app had no way to delete a
 * cellar at all. Destination unchanged: `/cellars`.
 */
export const EditCellarClient = ({ cellar, viewer }: EditCellarClientProps) => {
  const router = useRouter();

  const [{ data, fetching }] = useQuery({
    query: MyFriendsQuery,
    variables: { first: 100 },
  });

  const handleSubmitted = useCallback(() => {
    router.push(`/cellars`);
    router.refresh();
  }, [router]);

  if (fetching && data === undefined) return <PageLoading />;
  const friends = unwrapResult(data?.myFriends, "FriendConnection");
  if (!friends.ok) return <ApiError error={friends.error} />;

  const isCreator = viewer !== null && viewer.id === cellar.createdById;

  return (
    <Stack spacing={2}>
      <CellarForm
        id={cellar.id}
        defaults={{
          name: cellar.name,
          privacy: cellar.privacy,
          co_owners: [...cellar.coOwnerIds],
        }}
        friends={editCoOwnerOptions({
          friends: friends.data.edges.map((edge) => edge.node.user),
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
