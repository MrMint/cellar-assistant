import {
  Box,
  Button,
  Modal,
  ModalClose,
  ModalDialog,
  Typography,
} from "@mui/joy";
import { ItemType } from "@shared/gql/graphql";
import { useState } from "react";
import QRCode from "react-qr-code";
import { formatItemType } from "@/utilities";

export type ItemShareProps = {
  itemId: string;
  itemType: ItemType;
};
export const ItemShare = ({ itemId, itemType }: ItemShareProps) => {
  const [open, setOpen] = useState(false);

  const handleShareClick = async () => {
    const url = `${window.location.host}/${formatItemType(
      itemType,
    )}s/${itemId}`;

    if (navigator.canShare({ url })) {
      await navigator.share({ url });
    } else {
      setOpen(true);
    }
  };
  return (
    <>
      <Button onClick={handleShareClick} variant="outlined" color="neutral">
        Share
      </Button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalDialog>
          <ModalClose />
          <Typography level="title-lg">Link to item page</Typography>
          <Box sx={{ padding: "1rem", backgroundColor: "#fff" }}>
            <QRCode
              value={`${window.location.host}/${formatItemType(
                itemType,
              ).toLowerCase()}s/${itemId}`}
            />
          </Box>
        </ModalDialog>
      </Modal>
    </>
  );
};
