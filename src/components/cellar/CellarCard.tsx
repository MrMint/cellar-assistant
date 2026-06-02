import { AvatarGroup, IconButton, Stack, Tooltip, Typography } from "@mui/joy";
import { isNil, isNotNil } from "ramda";
import {
  FaBeer,
  FaCocktail,
  FaCoffee,
  FaGlassWhiskey,
  FaWineGlass,
} from "react-icons/fa";
import { MdEdit } from "react-icons/md";
import { UserAvatar } from "../common/UserAvatar";
import { InteractiveCard } from "../common/InteractiveCard";
import { Link } from "../common/Link";

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
};

const ITEM_TYPE_CONFIG = [
  { key: "wines" as const, label: "Wines", icon: FaWineGlass },
  { key: "beers" as const, label: "Beers", icon: FaBeer },
  { key: "spirits" as const, label: "Spirits", icon: FaCocktail },
  { key: "coffees" as const, label: "Coffees", icon: FaCoffee },
  { key: "sakes" as const, label: "Sakes", icon: FaGlassWhiskey },
];

type CellarCardProps = {
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
};

const canEdit = (userId: string, cellar: CellarCardProps["cellar"]) =>
  userId === cellar.createdBy.id ||
  cellar.coOwners.some((x) => x.id === userId);

export const CellarCard = ({
  userId,
  cellar,
  onClick,
  onEditClick,
}: CellarCardProps) => {
  return (
    <InteractiveCard sx={{ position: "relative" }}>
      {canEdit(userId, cellar) && (
        <Tooltip title="Edit Cellar">
          <IconButton
            size="sm"
            variant="soft"
            onClick={() => onEditClick(cellar.id)}
            sx={{
              position: "absolute",
              bottom: 8,
              right: 8,
              zIndex: 1,
            }}
          >
            <MdEdit />
          </IconButton>
        </Tooltip>
      )}

      <Stack
        direction="row"
        spacing={1}
        justifyContent="space-between"
        alignItems="center"
      >
        {isNil(onClick) && (
          <Link overlay href={`cellars/${cellar.id}/items`}>
            <Typography level="title-lg">{cellar.name}</Typography>
          </Link>
        )}
        {isNotNil(onClick) && (
          <Typography level="title-lg">{cellar.name}</Typography>
        )}
        <AvatarGroup sx={{ flexShrink: 0 }}>
          <Tooltip title={cellar.createdBy.displayName}>
            <UserAvatar
              avatarUrl={cellar.createdBy.avatarUrl}
              displayName={cellar.createdBy.displayName}
              size="sm"
            />
          </Tooltip>
          {cellar.coOwners.map((x) => (
            <Tooltip key={x.id} title={x.displayName}>
              <UserAvatar
                avatarUrl={x.avatarUrl}
                displayName={x.displayName}
                size="sm"
              />
            </Tooltip>
          ))}
        </AvatarGroup>
      </Stack>

      <Stack direction="row" spacing={2}>
        {ITEM_TYPE_CONFIG.map((t) => {
          const Icon = t.icon;
          const count = cellar.itemCounts[t.key];
          return (
            <Tooltip key={t.key} title={t.label}>
              <Stack
                direction="row"
                spacing={0.5}
                alignItems="center"
                sx={{
                  opacity: count > 0 ? 1 : 0.3,
                }}
              >
                <Icon size={18} />
                <Typography level="body-md">{count}</Typography>
              </Stack>
            </Tooltip>
          );
        })}
      </Stack>
    </InteractiveCard>
  );
};
