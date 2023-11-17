"use client";

import { useUserId } from "@nhost/nextjs";
import { graphql } from "@shared/gql";
import { useRouter } from "next/navigation";
import { isNil, isNotNil } from "ramda";
import { useCallback } from "react";
import { useQuery } from "urql";
import { CellarForm } from "@/components/cellar/CellarForm";
import { PageLoading } from "@/components/common/PageLoading";
import { nullsToUndefined } from "@/utilities";

const addCellarQuery = graphql(`
  query AddCellarQuery($userId: uuid!) {
    user(id: $userId) {
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

const AddCellar = () => {
  const router = useRouter();
  const userId = useUserId();
  if (isNil(userId)) throw new Error("Invalid user id");

  const [{ data }] = useQuery({
    query: addCellarQuery,
    variables: { userId },
  });

  const handleSubmitted = useCallback(
    (id: string) => {
      router.push(`/cellars/${id}/items`);
    },
    [router],
  );
  const user = nullsToUndefined(data?.user);

  return (
    <>
      {isNil(user) && <PageLoading />}
      {isNotNil(user) && (
        <CellarForm
          friends={user.friends.map((x) => x.friend)}
          onSubmitted={handleSubmitted}
        />
      )}
    </>
  );
};

export default AddCellar;
