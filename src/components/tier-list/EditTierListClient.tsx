"use client";

import { type FragmentOf, readFragment } from "@cellar-assistant/shared";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { TierListEditFragment } from "./fragments";
import { TierListForm } from "./TierListForm";

interface EditTierListClientProps {
  tierList: FragmentOf<typeof TierListEditFragment>;
}

export function EditTierListClient({ tierList }: EditTierListClientProps) {
  const router = useRouter();
  const data = readFragment(TierListEditFragment, tierList);

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
        list_type: data.list_type,
      }}
    />
  );
}
