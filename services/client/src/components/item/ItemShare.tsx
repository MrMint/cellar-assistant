"use client";

import {
  Box,
  Button,
  Modal,
  ModalClose,
  ModalDialog,
  Typography,
} from "@mui/joy";
import { useState } from "react";
import QRCode from "react-qr-code";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { itemShareUrl } from "./adapter";

export type ItemShareProps = {
  itemId: string;
  itemType: ApiItemType;
};

/**
 * `82450ad1:src/components/item/ItemShare.tsx`, restored with two fixes the
 * inventory recorded (§7): `navigator.canShare` is feature-tested before it is
 * called (it is absent on desktop Firefox, where the old button threw), and
 * the QR code carries an absolute URL with its scheme — the old value was
 * `host/wines/<id>`, which a phone camera reads as text, not a link.
 */
export const ItemShare = ({ itemId, itemType }: ItemShareProps) => {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  const handleShareClick = async () => {
    const target = itemShareUrl(window.location.origin, itemType, itemId);
    setUrl(target);
    if (
      typeof navigator.canShare === "function" &&
      navigator.canShare({ url: target })
    ) {
      try {
        await navigator.share({ url: target });
        return;
      } catch {
        // Dismissed, or refused: fall through to the QR code.
      }
    }
    setOpen(true);
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
            <QRCode value={url} />
          </Box>
        </ModalDialog>
      </Modal>
    </>
  );
};
