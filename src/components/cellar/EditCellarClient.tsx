"use client";

import { graphql } from "@cellar-assistant/shared";
import { useRouter } from "next/navigation";
import { isNil, isNotNil } from "ramda";
import { useCallback } from "react";
import { useQuery } from "urql";
import { CellarForm } from "@/components/cellar/CellarForm";
import { PageLoading } from "@/components/common/PageLoading";
import { nullsToUndefined } from "@/utilities";

const editCellarQuery = graphql(`
  query EditCellarQuery($id: uuid!, $userId: uuid!) {
    cellars_by_pk(id: $id) {
      id
      name
      privacy
      created_by_id
      co_owners {
        user_id
      }
    }
    user(id: $userId) {
      id
      displayName
      avatarUrl
      friends {
        friend {
          id
          displayName
          avatarUrl
        }
      }
    }
  }
`);

interface EditCellarClientProps {
  cellarId: string;
  userId: string;
}

export const EditCellarClient = ({
  cellarId,
  userId,
}: EditCellarClientProps) => {
  const router = useRouter();
  if (isNil(userId)) throw new Error("Invalid user id");

  const [{ data }] = useQuery({
    query: editCellarQuery,
    variables: { id: cellarId, userId },
  });

  const handleSubmitted = useCallback(() => {
    router.push(`/cellars`);
  }, [router]);

  const cellar = nullsToUndefined(data?.cellars_by_pk);
  const user = nullsToUndefined(data?.user);
  return (
    <>
      {isNil(cellar) && <PageLoading />}
      {isNotNil(user) && isNotNil(cellar) && (
        <CellarForm
          id={cellarId}
          defaults={{
            name: cellar.name,
            privacy: cellar.privacy,
            co_owners: cellar.co_owners.map((x) => x.user_id),
          }}
          friends={user.friends
            .map((x) => x.friend)
            .concat([
              {
                id: user.id,
                avatarUrl: user.avatarUrl,
                displayName: user.displayName,
              },
            ])
            .filter((x) => x.id !== cellar.created_by_id)}
          onSubmitted={handleSubmitted}
        />
      )}
    </>
  );
};
