import { type FragmentOf, readFragment } from "@cellar-assistant/shared";
import { CellarItemsClient } from "./CellarItemsClient";
import { CellarInfoFragment } from "./fragments";

interface CellarItemsProps {
  cellarInfo: FragmentOf<typeof CellarInfoFragment>;
  cellarId: string;
  userId: string;
}

export function CellarItems({
  cellarInfo,
  cellarId,
  userId,
}: CellarItemsProps) {
  const cellar = readFragment(CellarInfoFragment, cellarInfo);

  const isOwner = cellar.created_by_id === userId;
  const coOwnerIds = cellar.co_owners?.map((co) => co.user_id) || [];

  return (
    <CellarItemsClient
      cellarId={cellarId}
      userId={userId}
      cellarName={cellar.name}
      isOwner={isOwner}
      coOwnerIds={coOwnerIds}
    />
  );
}
