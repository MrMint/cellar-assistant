/**
 * `82450ad1:src/components/cellar/CellarCard.tsx`, restored, on the app
 * primitives. The title link was relative (`cellars/<id>/items`) and so only
 * resolved from `/cellars` itself (§7); it is absolute now. Props come from
 * `adapter.ts` (`cellarCardFromFragment`).
 *
 * Same tree as the old card: the name (an overlay link over the whole tile),
 * the "Edit Cellar" button for an owner, the owners' avatars, then the six
 * per-type counts with zeros dimmed. The Joy `AvatarGroup` is an overlapping
 * `app/UserAvatar` stack; the type icons are the type glyphs (design §3.1).
 */
import { isNil, isNotNil } from "ramda";
import { IconButton } from "@/components/app/IconButton";
import { Edit, ICON_STROKE } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { itemTypeTokens } from "@/components/app/TypeChip";
import { UserAvatar } from "@/components/app/UserAvatar";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { cn } from "@/lib/utils";

type User = {
  id: string;
  displayName: string;
  avatarUrl: string;
};

type ItemCounts = {
  wines: number;
  beers: number;
  spirits: number;
  coffees: number;
  sakes: number;
  teas: number;
};

const ITEM_TYPE_CONFIG = [
  { key: "wines", label: "Wines", type: "WINE" },
  { key: "beers", label: "Beers", type: "BEER" },
  { key: "spirits", label: "Spirits", type: "SPIRIT" },
  { key: "coffees", label: "Coffees", type: "COFFEE" },
  { key: "sakes", label: "Sakes", type: "SAKE" },
  { key: "teas", label: "Teas", type: "TEA" },
] as const satisfies readonly {
  key: keyof ItemCounts;
  label: string;
  type: ApiItemType;
}[];

export type CellarCardProps = {
  cellar: {
    id: string;
    name: string;
    createdBy: User;
    coOwners: User[];
    itemCounts: ItemCounts;
  };
  userId: string;
  onEditClick: (cellarId: string) => void;
  onClick?: (cellarId: string) => void;
  /** Called as the title link is followed (the grid saves its scroll here). */
  onNavigate?: () => void;
};

const canEdit = (userId: string, cellar: CellarCardProps["cellar"]) =>
  userId === cellar.createdBy.id ||
  cellar.coOwners.some((x) => x.id === userId);

export const CellarCard = ({
  userId,
  cellar,
  onClick,
  onEditClick,
  onNavigate,
}: CellarCardProps) => {
  const owners = [cellar.createdBy, ...cellar.coOwners];
  return (
    <div
      data-slot="cellar-card"
      className="group relative flex flex-col gap-4 rounded-lg bg-surface-1 p-4 transition-colors duration-(--ca-dur-micro) ease-standard hover:bg-surface-2"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {isNil(onClick) && (
            <Link
              overlay
              underline="none"
              href={`/cellars/${cellar.id}/items`}
              onClick={onNavigate}
              className="min-w-0"
            >
              <span className="t-head block truncate">
                {cellar.name}
              </span>
            </Link>
          )}
          {isNotNil(onClick) && (
            <span className="t-head min-w-0 truncate">
              {cellar.name}
            </span>
          )}
          {canEdit(userId, cellar) && (
            <IconButton
              size="sm"
              variant="secondary"
              aria-label="Edit Cellar"
              title="Edit Cellar"
              onClick={() => onEditClick(cellar.id)}
              className="relative z-10"
            >
              <Edit />
            </IconButton>
          )}
        </div>
        <div className="flex shrink-0 -space-x-2">
          {owners.map((owner) => (
            <UserAvatar
              key={owner.id}
              avatarUrl={owner.avatarUrl}
              displayName={owner.displayName}
              title={owner.displayName}
              size="sm"
              // The ring is the card's own surface, hover included, so the
              // overlap reads as a cut-out rather than a stray outline.
              className="ring-2 ring-surface-1 transition-[box-shadow] duration-(--ca-dur-micro) ease-standard group-hover:ring-surface-2"
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        {ITEM_TYPE_CONFIG.map((t) => {
          const { glyph: Glyph, textClass } = itemTypeTokens[t.type];
          const count = cellar.itemCounts[t.key];
          return (
            <span
              key={t.key}
              title={t.label}
              className={cn(
                "flex items-center gap-1 text-ink-1",
                count === 0 && "opacity-30",
              )}
            >
              <Glyph
                role="img"
                aria-label={t.label}
                strokeWidth={ICON_STROKE}
                className={cn("size-[18px] shrink-0", textClass)}
              />
              <span className="t-body tabular">{count}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
};
