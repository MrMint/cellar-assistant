import TopNavigationBar from "@/components/HeaderBar";
import { Button, Stack } from "@mui/joy";
import { MdDelete, MdEdit } from "react-icons/md";

type ItemHeaderProps = {
  itemId: string;
  itemName: string | undefined;
  cellarId: string;
  cellarName: string | undefined;
};

const ItemHeader = ({
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
        <Button disabled startDecorator={<MdEdit />}>
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
