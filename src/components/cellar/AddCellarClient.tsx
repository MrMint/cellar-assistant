"use client";

import { graphql } from "@cellar-assistant/shared";
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

interface AddCellarClientProps {
  userId: string;
}

export function AddCellarClient({ userId }: AddCellarClientProps) {
  const router = useRouter();

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
}
