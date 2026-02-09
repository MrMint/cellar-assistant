"use client";

import {
  Box,
  CircularProgress,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
  ListItemDecorator,
  Modal,
  ModalDialog,
  Stack,
  Typography,
} from "@mui/joy";
import { useCallback, useState } from "react";
import { MdCheck, MdFormatListNumbered } from "react-icons/md";
import { useQuery } from "urql";
import { addItemToTierListAction } from "@/app/actions/tierLists";
import { BAND_LABELS } from "./constants";
import { GetTierListsForPlaceQuery } from "./queries";

// =============================================================================
// Types
// =============================================================================

interface AddToTierListModalProps {
  open: boolean;
  onClose: () => void;
  placeId: string;
  placeName: string;
  existingRating?: number | null;
}

// =============================================================================
// Main Modal
// =============================================================================

export function AddToTierListModal({
  open,
  onClose,
  placeId,
  placeName,
}: AddToTierListModalProps) {
  const [{ data, fetching }] = useQuery({
    query: GetTierListsForPlaceQuery,
    variables: { placeId },
    pause: !open,
  });

  const [addingToListId, setAddingToListId] = useState<string | null>(null);

  const tierLists = data?.tier_lists ?? [];

  const handleAddToList = useCallback(
    async (tierListId: string) => {
      setAddingToListId(tierListId);
      try {
        await addItemToTierListAction(tierListId, placeId, "place", 0, 0);
        onClose();
      } finally {
        setAddingToListId(null);
      }
    },
    [placeId, onClose],
  );

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog variant="outlined" sx={{ maxWidth: 420, width: "100%" }}>
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <MdFormatListNumbered style={{ fontSize: 20 }} />
            <span>Add to Tier List</span>
          </Stack>
        </DialogTitle>
        <Divider />
        <DialogContent>
          <Stack spacing={2}>
            <Typography level="body-sm" sx={{ color: "text.secondary" }}>
              Add <strong>{placeName}</strong> to a tier list
            </Typography>

            {fetching ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                <CircularProgress size="sm" />
              </Box>
            ) : tierLists.length === 0 ? (
              <Typography
                level="body-sm"
                sx={{ color: "text.tertiary", textAlign: "center", py: 2 }}
              >
                No place tier lists yet. Create one first.
              </Typography>
            ) : (
              <List
                size="sm"
                variant="outlined"
                sx={{ borderRadius: "md", overflow: "hidden" }}
              >
                {tierLists.map((tl) => {
                  const alreadyIn = tl.items.length > 0;
                  const isAdding = addingToListId === tl.id;
                  return (
                    <ListItem key={tl.id}>
                      <ListItemButton
                        onClick={() => handleAddToList(tl.id)}
                        disabled={alreadyIn || addingToListId != null}
                        sx={{
                          borderRadius: "sm",
                          ...(alreadyIn && {
                            bgcolor: "success.softBg",
                            "&.Mui-disabled": { opacity: 1 },
                          }),
                        }}
                      >
                        <ListItemDecorator>
                          {isAdding ? (
                            <CircularProgress
                              size="sm"
                              sx={{ "--CircularProgress-size": "20px" }}
                            />
                          ) : alreadyIn ? (
                            <MdCheck
                              style={{
                                color: "var(--joy-palette-success-500)",
                              }}
                            />
                          ) : (
                            <MdFormatListNumbered />
                          )}
                        </ListItemDecorator>
                        <ListItemContent>
                          <Typography level="title-sm">{tl.name}</Typography>
                          {alreadyIn && (
                            <Typography
                              level="body-xs"
                              sx={{ color: "success.600" }}
                            >
                              Already added ({BAND_LABELS[tl.items[0].band]})
                            </Typography>
                          )}
                        </ListItemContent>
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
            )}
          </Stack>
        </DialogContent>
      </ModalDialog>
    </Modal>
  );
}
