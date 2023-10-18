import TopNavigationBar from "@/components/common/HeaderBar";
import { ItemType } from "@/constants";
import { Button, Stack } from "@mui/joy";
import { MdDelete, MdEdit } from "react-icons/md";
import Link from "../common/Link";

type ItemHeaderProps = {
  itemId: string;
  itemName: string | undefined;
  itemType: ItemType;
  cellarId: string;
  cellarName: string | undefined;
};

const ItemHeader = ({
  itemType,
  itemId,
  itemName,
  cellarId,
  cellarName,
}: ItemHeaderProps) => (
  <TopNavigationBar
    breadcrumbs={[
      { url: "/cellars", text: "Cellars" },
      {
        url: `/cellars/${cellarId}/items`,
        text: cellarName ?? "loading...",
      },
      {
        url: `${itemId}`,
        text: itemName ?? "loading...",
      },
    ]}
    endComponent={
      <Stack spacing={2} direction="row">
        <Button
          component={Link}
          href={`${itemId}/edit`}
          startDecorator={<MdEdit />}
        >
          Edit item
        </Button>
        <Button disabled startDecorator={<MdDelete />}>
          Delete item
        </Button>
      </Stack>
    }
  />
);

export default ItemHeader;
