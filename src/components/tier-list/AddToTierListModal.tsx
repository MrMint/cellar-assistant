"use client";

import type { Permission_Type_Enum } from "@cellar-assistant/shared";
import {
  Box,
  Button,
  CircularProgress,
  DialogContent,
  DialogTitle,
  Divider,
  Input,
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
  ListItemDecorator,
  Modal,
  ModalDialog,
  Snackbar,
  Stack,
  Typography,
} from "@mui/joy";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MdAdd, MdCheck, MdFormatListNumbered } from "react-icons/md";
import { useQuery } from "urql";
import {
  addItemToTierListAction,
  addTierListAction,
} from "@/app/actions/tierLists";
import { BAND_LABELS, type TierListEntityType } from "./constants";
import { GetTierListsForItemQuery } from "./queries";

// =============================================================================
// Helpers
// =============================================================================

const ENTITY_TYPE_LABELS: Record<TierListEntityType, string> = {
  place: "Place",
  wine: "Wine",
  beer: "Beer",
  spirit: "Spirit",
  coffee: "Coffee",
  sake: "Sake",
  tea: "Tea",
};

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * Build the polymorphic id variables for GetTierListsForItemQuery, setting the
 * field that matches `entityType` and leaving the rest as the nil UUID so their
 * `_eq` filters match nothing.
 */
function buildEntityIdVariables(
  entityType: TierListEntityType,
  entityId: string,
) {
  return {
    placeId: entityType === "place" ? entityId : NIL_UUID,
    wineId: entityType === "wine" ? entityId : NIL_UUID,
    beerId: entityType === "beer" ? entityId : NIL_UUID,
    spiritId: entityType === "spirit" ? entityId : NIL_UUID,
    coffeeId: entityType === "coffee" ? entityId : NIL_UUID,
    sakeId: entityType === "sake" ? entityId : NIL_UUID,
    teaId: entityType === "tea" ? entityId : NIL_UUID,
  };
}

// =============================================================================
// Types
// =============================================================================

interface AddToTierListModalProps {
  open: boolean;
  onClose: () => void;
  entityId: string;
  entityType: TierListEntityType;
  entityName: string;
  userId: string;
}

// =============================================================================
// Main Modal
// =============================================================================

export function AddToTierListModal({
  open,
  onClose,
  entityId,
  entityType,
  entityName,
  userId,
}: AddToTierListModalProps) {
  const router = useRouter();

  const [{ data, fetching }] = useQuery({
    query: GetTierListsForItemQuery,
    variables: {
      listType: entityType,
      userId,
      ...buildEntityIdVariables(entityType, entityId),
    },
    pause: !open,
  });

  const [addingToListId, setAddingToListId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creating, setCreating] = useState(false);

  const tierLists = data?.tier_lists ?? [];
  const busy = addingToListId != null || creating;

  // Reset the create form whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setShowCreate(false);
    setNewListName(`My ${ENTITY_TYPE_LABELS[entityType]} Tier List`);
  }, [open, entityType]);

  const handleAddToList = useCallback(
    async (tierListId: string) => {
      setAddingToListId(tierListId);
      try {
        const result = await addItemToTierListAction(
          tierListId,
          entityId,
          entityType,
          0,
          0,
        );
        if (result.success) {
          router.refresh();
          onClose();
        } else {
          setError(result.error ?? "Failed to add item to tier list");
        }
      } finally {
        setAddingToListId(null);
      }
    },
    [entityId, entityType, onClose, router],
  );

  const handleCreateAndAdd = useCallback(async () => {
    const name = newListName.trim();
    if (name.length === 0) {
      setError("Please enter a name for the new list");
      return;
    }
    setCreating(true);
    try {
      const created = await addTierListAction(
        name,
        undefined,
        "PRIVATE" as Permission_Type_Enum,
        entityType,
      );
      if (!created.success || !created.tierListId) {
        setError(created.error ?? "Failed to create tier list");
        return;
      }
      const added = await addItemToTierListAction(
        created.tierListId,
        entityId,
        entityType,
        0,
        0,
      );
      if (added.success) {
        router.refresh();
        onClose();
      } else {
        setError(added.error ?? "Failed to add item to tier list");
      }
    } finally {
      setCreating(false);
    }
  }, [newListName, entityId, entityType, onClose, router]);

  const hasLists = tierLists.length > 0;

  return (
    <>
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
                Add <strong>{entityName}</strong> to a tier list
              </Typography>

              {fetching ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                  <CircularProgress size="sm" />
                </Box>
              ) : (
                <>
                  {hasLists && (
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
                              disabled={alreadyIn || busy}
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
                                <Typography level="title-sm">
                                  {tl.name}
                                </Typography>
                                {alreadyIn && (
                                  <Typography
                                    level="body-xs"
                                    sx={{ color: "success.600" }}
                                  >
                                    Already added (
                                    {BAND_LABELS[tl.items[0].band]})
                                  </Typography>
                                )}
                              </ListItemContent>
                            </ListItemButton>
                          </ListItem>
                        );
                      })}
                    </List>
                  )}

                  {!hasLists && !showCreate && (
                    <Typography
                      level="body-sm"
                      sx={{ color: "text.tertiary", textAlign: "center" }}
                    >
                      You don't have any{" "}
                      {ENTITY_TYPE_LABELS[entityType].toLowerCase()} tier lists
                      yet.
                    </Typography>
                  )}

                  {showCreate ? (
                    <Stack spacing={1}>
                      <Input
                        autoFocus
                        size="sm"
                        placeholder="List name"
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !busy) {
                            void handleCreateAndAdd();
                          }
                        }}
                        disabled={busy}
                      />
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="sm"
                          startDecorator={<MdAdd />}
                          loading={creating}
                          disabled={busy}
                          onClick={() => void handleCreateAndAdd()}
                        >
                          Create &amp; add
                        </Button>
                        <Button
                          size="sm"
                          variant="plain"
                          color="neutral"
                          disabled={busy}
                          onClick={() => setShowCreate(false)}
                        >
                          Cancel
                        </Button>
                      </Stack>
                    </Stack>
                  ) : (
                    <Button
                      size="sm"
                      variant="outlined"
                      color="neutral"
                      startDecorator={<MdAdd />}
                      disabled={busy}
                      onClick={() => setShowCreate(true)}
                    >
                      Create new list
                    </Button>
                  )}
                </>
              )}
            </Stack>
          </DialogContent>
        </ModalDialog>
      </Modal>

      <Snackbar
        open={error !== null}
        autoHideDuration={3000}
        onClose={() => setError(null)}
        color="danger"
        variant="soft"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {error}
      </Snackbar>
    </>
  );
}
