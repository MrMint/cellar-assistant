import {
  AvatarGroup,
  Card,
  ListDivider,
  ListItemButton,
  ListItemContent,
  Tooltip,
  Typography,
} from "@mui/joy";
import { Link } from "../common/Link";
import { UserAvatar } from "../common/UserAvatar";

export type ItemCellarUser = {
  id: string;
  displayName: string;
  avatarUrl: string;
};

export type ItemCellar = {
  id: string;
  name: string;
  createdBy: ItemCellarUser;
  co_owners: ItemCellarUser[];
};

type ItemCellarsProps = { cellars: ItemCellar[] };

/**
 * `82450ad1:src/components/item/ItemCellars.tsx`, verbatim but for ramda.
 * Fed by `Item.cellars` (G9) — non-empty bottles in cellars the viewer may see.
 */
export const ItemCellars = ({ cellars }: ItemCellarsProps) => {
  return (
    <Card>
      <Typography level="title-lg">Located in:</Typography>
      {cellars.length > 0 &&
        cellars.map((cellar) => (
          <Link
            key={cellar.id}
            href={`/cellars/${cellar.id}/items`}
            sx={{ display: "flex" }}
          >
            <ListDivider />
            <ListItemButton sx={{ flexGrow: 1, padding: "0 1rem" }}>
              <ListItemContent>
                <Typography level="title-md">{cellar.name}</Typography>
              </ListItemContent>
              <AvatarGroup>
                {cellar.co_owners.concat([cellar.createdBy]).map((x) => (
                  <Tooltip key={x.id} title={x.displayName}>
                    <UserAvatar
                      avatarUrl={x.avatarUrl}
                      displayName={x.displayName}
                      size="sm"
                    />
                  </Tooltip>
                ))}
              </AvatarGroup>
            </ListItemButton>
          </Link>
        ))}
      {cellars.length === 0 && (
        <Typography padding="1rem" justifyContent="center" textAlign="center">
          Not in any cellars, variety is the spice of life!
        </Typography>
      )}
    </Card>
  );
};
