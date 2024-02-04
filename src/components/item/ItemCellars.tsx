import {
  Avatar,
  AvatarGroup,
  Card,
  ListDivider,
  ListItem,
  ListItemButton,
  ListItemContent,
  ListItemDecorator,
  Tooltip,
  Typography,
} from "@mui/joy";
import { isEmpty, not } from "ramda";
import { Link } from "../common/Link";

type user = {
  id: string;
  displayName: string;
  avatarUrl: string;
};

type cellar = {
  id: string;
  name: string;
  createdBy: user;
  co_owners: user[];
};

type ItemCellarsProps = { cellars: cellar[] };

export const ItemCellars = ({ cellars }: ItemCellarsProps) => {
  return (
    <Card>
      <Typography level="title-lg">Located in:</Typography>
      {not(isEmpty(cellars)) &&
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
                    <Avatar src={x.avatarUrl} size="sm" />
                  </Tooltip>
                ))}
              </AvatarGroup>
            </ListItemButton>
          </Link>
        ))}
      {isEmpty(cellars) && (
        <Typography padding="1rem" justifyContent="center" textAlign="center">
          Not in any cellars, variety is the spice of life!
        </Typography>
      )}
    </Card>
  );
};
