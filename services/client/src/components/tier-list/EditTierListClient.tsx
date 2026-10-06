"use client";

/**
 * `82450ad1:src/components/tier-list/EditTierListClient.tsx`, restored; the
 * fragment is unmasked (`@_unmask`), so there is nothing to read.
 */

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { ResultOf } from "@/lib/api/graphql";
import type { TierListEditFragment } from "./fragments";
import { TierListForm } from "./TierListForm";

interface EditTierListClientProps {
  tierList: ResultOf<typeof TierListEditFragment>;
}

export function EditTierListClient({ tierList }: EditTierListClientProps) {
  const router = useRouter();
  const data = tierList;

  const handleSubmitted = useCallback(
    (id: string) => {
      router.push(`/tier-lists/${id}`);
    },
    [router],
  );

  return (
    <TierListForm
      id={data.id}
      onSubmitted={handleSubmitted}
      defaults={{
        name: data.name,
        description: data.description ?? "",
        privacy:
          data.privacy === "PRIVATE" ||
          data.privacy === "FRIENDS" ||
          data.privacy === "PUBLIC"
            ? data.privacy
            : "PRIVATE",
        list_type: data.listType,
      }}
    />
  );
}
