/**
 * `82450ad1:src/components/tier-list/TierListCard.tsx`, restored. Only the
 * field names change: `items_aggregate.count` → `itemCount`, `list_type` →
 * `listType`; `createdBy` is G4's `UserProfile` (null when signed out, which
 * reads "Unknown user" as before).
 *
 * On the app's primitives (D20): a tonal tile (no border) whose name is an
 * overlay `app/Link`, so the whole tile is the target.
 */

import {
  type AppIcon,
  ICON_STROKE,
  Lock,
  People,
  Public,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { UserAvatar } from "@/components/app/UserAvatar";
import { Badge } from "@/components/ui/badge";
import type { ResultOf } from "@/lib/api/graphql";
import type { TierListCardFragment } from "./fragments";

/** The unmasked `TierListCard` fragment. */
export type TierListCardData = ResultOf<typeof TierListCardFragment>;

type TierListCardProps = {
  tierList: TierListCardData;
  /** Runs before the link navigates (`VirtualGrid` saves its scroll here). */
  onNavigate?: () => void;
};

const privacyIcons: Record<string, { icon: AppIcon; label: string }> = {
  PRIVATE: { icon: Lock, label: "Private" },
  FRIENDS: { icon: People, label: "Friends" },
  PUBLIC: { icon: Public, label: "Public" },
};

const listTypeLabels: Record<string, string> = {
  place: "Places",
  wine: "Wines",
  beer: "Beers",
  spirit: "Spirits",
  coffee: "Coffees",
  sake: "Sake",
  tea: "Teas",
};

export function TierListCard({ tierList, onNavigate }: TierListCardProps) {
  const privacy = privacyIcons[tierList.privacy] ?? privacyIcons.PRIVATE;
  const PrivacyIcon = privacy.icon;
  const itemCount = tierList.itemCount;
  const typeLabel = listTypeLabels[tierList.listType] ?? tierList.listType;
  const creatorName = tierList.createdBy?.displayName ?? "Unknown user";

  return (
    <article
      data-slot="tier-list-card"
      className="relative flex h-full flex-col gap-2 rounded-lg bg-surface-1 p-4 transition-colors duration-(--ca-dur-short) ease-standard hover:bg-surface-2"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 text-ink-1 type-headline">
          <Link
            href={`/tier-lists/${tierList.id}`}
            overlay
            underline="none"
            onClick={onNavigate}
          >
            {tierList.name}
          </Link>
        </h3>
        <PrivacyIcon
          aria-hidden
          strokeWidth={ICON_STROKE}
          className="size-[18px] shrink-0 text-ink-3"
        />
        <span className="sr-only">{privacy.label}</span>
      </div>

      {tierList.description && (
        <p className="line-clamp-2 text-ink-2 type-callout">
          {tierList.description}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-ink-2">
          {typeLabel}
        </Badge>
        <span className="tabular type-footnote">
          {itemCount} {itemCount === 1 ? "item" : "items"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <UserAvatar
          avatarUrl={tierList.createdBy?.avatarUrl}
          displayName={creatorName}
          size="sm"
          className="size-5 text-[10px]"
        />
        <span className="text-ink-2 type-footnote">{creatorName}</span>
      </div>
    </article>
  );
}
