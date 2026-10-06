"use client";

import {
  Button,
  Checkbox,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Dropdown,
  List,
  ListItem,
  Menu,
  MenuButton,
  MenuItem,
  Modal,
  ModalDialog,
  Typography,
} from "@mui/joy";
import { useCallback, useState } from "react";
import { MdLocalBar } from "react-icons/md";
import { useMutation, useQuery } from "urql";
import {
  BulkCheckInMutation,
  CheckInMutation,
  MyFriendsQuery,
} from "@/lib/api/cellars";
import { type ApiFailure, unwrapResult } from "@/lib/api/result";
import { ApiError } from "./ApiError";

/**
 * "I drank some of this", for the viewer alone or for the table.
 *
 * Two mutations, deliberately not one: `checkIn` needs only that the cellar be
 * *visible* to the viewer, while `bulkCheckIn` additionally requires every id
 * to be the viewer or a friend of theirs and rejects the whole call otherwise —
 * so the picker offers friends and nobody else.
 *
 * `checkInId` is minted here rather than by the server, which makes a retry
 * after a dropped response idempotent (§8.4).
 */
export function CheckInButton({
  cellarId,
  cellarItemId,
  itemName,
  viewerId,
  onCheckedIn,
  size = "sm",
}: {
  cellarId: string;
  cellarItemId: string;
  itemName: string;
  /** Included in `bulkCheckIn`'s ids, so "me and friends" means what it says. */
  viewerId: string | null;
  onCheckedIn?: () => void;
  size?: "sm" | "md";
}) {
  const [error, setError] = useState<ApiFailure | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const [checkInState, checkIn] = useMutation(CheckInMutation);
  const [bulkState, bulkCheckIn] = useMutation(BulkCheckInMutation);

  const [{ data: friendsData }] = useQuery({
    query: MyFriendsQuery,
    variables: { first: 100 },
    pause: !bulkOpen,
  });
  const friendsResult = unwrapResult(
    friendsData?.myFriends,
    "FriendConnection",
  );
  const friends = friendsResult.ok
    ? friendsResult.data.edges.map((edge) => edge.node.user)
    : [];

  const checkInSelf = useCallback(async () => {
    setError(null);
    const response = await checkIn({
      cellarId,
      cellarItemId,
      checkInId: crypto.randomUUID(),
    });
    const result = unwrapResult(response.data?.checkIn ?? undefined, "CheckIn");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onCheckedIn?.();
  }, [checkIn, cellarId, cellarItemId, onCheckedIn]);

  const checkInTable = useCallback(async () => {
    setError(null);
    const response = await bulkCheckIn({
      cellarId,
      cellarItemId,
      userIds: viewerId === null ? selected : [viewerId, ...selected],
    });
    const result = unwrapResult(
      response.data?.bulkCheckIn ?? undefined,
      "BulkCheckInPayload",
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBulkOpen(false);
    setSelected([]);
    onCheckedIn?.();
  }, [bulkCheckIn, cellarId, cellarItemId, selected, viewerId, onCheckedIn]);

  const toggle = (id: string): void => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  };

  return (
    <>
      <Dropdown>
        <MenuButton
          size={size}
          variant="soft"
          color="primary"
          startDecorator={<MdLocalBar />}
          loading={checkInState.fetching}
        >
          Check in
        </MenuButton>
        <Menu size="sm" placement="bottom-end">
          <MenuItem onClick={() => void checkInSelf()}>Just me</MenuItem>
          <MenuItem
            onClick={() => {
              setError(null);
              setSelected([]);
              setBulkOpen(true);
            }}
          >
            Me and friends…
          </MenuItem>
        </Menu>
      </Dropdown>

      {error !== null && !bulkOpen && <ApiError error={error} />}

      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)}>
        <ModalDialog variant="outlined" sx={{ minWidth: 320 }}>
          <DialogTitle>Who is drinking?</DialogTitle>
          <Divider />
          <DialogContent>
            <Typography level="body-sm" sx={{ mb: 1 }}>
              {itemName}
            </Typography>
            {friends.length === 0 ? (
              <Typography level="body-sm" textColor="text.tertiary">
                You have no friends to check in for yet.
              </Typography>
            ) : (
              <List size="sm">
                {friends.map((friend) => (
                  <ListItem key={friend.id}>
                    <Checkbox
                      label={friend.displayName}
                      checked={selected.includes(friend.id)}
                      onChange={() => toggle(friend.id)}
                    />
                  </ListItem>
                ))}
              </List>
            )}
            {error !== null && <ApiError error={error} />}
          </DialogContent>
          <DialogActions>
            <Button
              loading={bulkState.fetching}
              disabled={selected.length === 0}
              onClick={() => void checkInTable()}
            >
              Check in {selected.length > 0 ? `(${selected.length})` : ""}
            </Button>
            <Button
              variant="plain"
              color="neutral"
              onClick={() => setBulkOpen(false)}
            >
              Cancel
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>
    </>
  );
}
