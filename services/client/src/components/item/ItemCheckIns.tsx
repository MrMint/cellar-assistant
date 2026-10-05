"use client";

import {
  AvatarGroup,
  Button,
  Card,
  Checkbox,
  DialogActions,
  List,
  ListDivider,
  ListItem,
  ListItemButton,
  ListItemContent,
  ListItemDecorator,
  Modal,
  ModalDialog,
  Stack,
  Tooltip,
  Typography,
} from "@mui/joy";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useMutation } from "urql";
import { BulkCheckInMutation, CheckInMutation } from "@/lib/api/cellars";
import { unwrapResult } from "@/lib/api/result";
import { Timestamp } from "../common/Timestamp";
import { UserAvatar } from "../common/UserAvatar";
import { groupCheckInsByDay } from "./adapter";

type User = {
  id: string;
  displayName: string;
  avatarUrl: string;
};

type CheckIn = {
  id: string;
  createdAt: string;
  user: User;
};

export type ItemCheckInsProps = {
  checkIns: CheckIn[];
  /** The bottle (`cellar_items.id`). */
  itemId: string;
  cellarId: string;
  friends: User[];
  user: User;
};

/**
 * `82450ad1:src/components/item/ItemCheckIns.tsx`, restored.
 *
 * `addCheckInAction(cellarItemId)` → `checkIn` with a client-minted
 * `checkInId` (a retry writes one row); `addBulkCheckInsAction` →
 * `bulkCheckIn`, whose ids must be the viewer or friends — which is exactly
 * what the picker offers. The list is `CellarItem.checkIns` (G14) with
 * `CheckIn.user` (G4). Rows are grouped by UTC day and dated through
 * `common/Timestamp` instead of date-fns (the hydration rule), so a check-in
 * near midnight can sit under its UTC day rather than the viewer's.
 */
export const ItemCheckIns = ({
  checkIns,
  itemId,
  cellarId,
  friends,
  user,
}: ItemCheckInsProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bulk, setBulk] = useState([] as string[]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isBulkPending, startBulkTransition] = useTransition();
  const [, checkIn] = useMutation(CheckInMutation);
  const [, bulkCheckIn] = useMutation(BulkCheckInMutation);

  const handleClickCheckIn = () => {
    startTransition(async () => {
      setError(null);
      const response = await checkIn({
        cellarId,
        cellarItemId: itemId,
        checkInId: crypto.randomUUID(),
      });
      const result = unwrapResult(response.data?.checkIn, "CheckIn");
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  };

  const handleClickBulk = () => {
    setOpen(true);
  };

  const handleBulkCheckIn = () => {
    startBulkTransition(async () => {
      setError(null);
      const response = await bulkCheckIn({
        cellarId,
        cellarItemId: itemId,
        userIds: bulk,
      });
      const result = unwrapResult(
        response.data?.bulkCheckIn,
        "BulkCheckInPayload",
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  const handleClickBulkUser = (userId: string) => {
    if (bulk.includes(userId)) {
      setBulk(bulk.filter((id) => id !== userId));
    } else {
      setBulk(bulk.concat([userId]));
    }
  };

  useEffect(() => {
    if (!open) {
      setBulk([]);
    }
  }, [open]);

  return (
    <>
      <Card>
        <Stack direction="row" spacing={2}>
          <Button
            variant="solid"
            color="primary"
            onClick={handleClickCheckIn}
            loading={isPending}
            fullWidth
          >
            Check In
          </Button>
          {friends.length > 0 && (
            <Button
              variant="solid"
              color="primary"
              onClick={handleClickBulk}
              loading={isPending}
              fullWidth
            >
              Bulk Check In
            </Button>
          )}
        </Stack>
        {error !== null && (
          <Typography level="body-sm" color="danger">
            {error}
          </Typography>
        )}
        {checkIns.length > 0 && (
          <List>
            {groupCheckInsByDay(checkIns).flatMap(([dateKey, x]) => [
              <ListDivider key={`divider-${dateKey}`} />,
              <ListItem key={dateKey}>
                <ListItemContent>
                  <AvatarGroup>
                    {x.map((y) => (
                      <Tooltip key={y.id} title={y.user.displayName}>
                        <UserAvatar
                          avatarUrl={y.user.avatarUrl}
                          displayName={y.user.displayName}
                        />
                      </Tooltip>
                    ))}
                  </AvatarGroup>
                </ListItemContent>
                <Typography>
                  <Timestamp
                    iso={x[0]?.createdAt ?? dateKey}
                    precision="date"
                  />
                </Typography>
              </ListItem>,
            ])}
            <ListDivider />
          </List>
        )}
      </Card>
      <Modal open={open}>
        <ModalDialog>
          <Typography>Select Friends</Typography>
          <List size="lg">
            {[user].concat(friends).map((user) => (
              <ListItem variant="outlined" key={user.id}>
                <ListItemButton onClick={() => handleClickBulkUser(user.id)}>
                  <ListItemDecorator>
                    <Checkbox readOnly checked={bulk.includes(user.id)} />
                  </ListItemDecorator>
                  <UserAvatar
                    avatarUrl={user.avatarUrl}
                    displayName={user.displayName}
                  />
                  <ListItemContent>
                    <Typography level="title-md">{user.displayName}</Typography>
                  </ListItemContent>
                </ListItemButton>
              </ListItem>
            ))}
          </List>
          <DialogActions>
            <Button
              variant="solid"
              color="primary"
              loading={isBulkPending}
              onClick={handleBulkCheckIn}
              disabled={bulk.length === 0}
            >
              Check In
            </Button>
            <Button
              variant="plain"
              color="neutral"
              disabled={isBulkPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>
    </>
  );
};
