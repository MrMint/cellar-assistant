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
import { format, parseISO } from "date-fns";
import { groupBy, isEmpty, not, without } from "ramda";
import { useEffect, useState, useTransition } from "react";
import {
  addBulkCheckInsAction,
  addCheckInAction,
} from "@/app/actions/checkIns";
import { UserAvatar } from "../common/UserAvatar";

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
  itemId: string;
  friends: User[];
  user: User;
};

export const ItemCheckIns = ({
  checkIns,
  itemId,
  friends,
  user,
}: ItemCheckInsProps) => {
  const [open, setOpen] = useState(false);
  const [bulk, setBulk] = useState([] as string[]);
  const [isPending, startTransition] = useTransition();
  const [isBulkPending, startBulkTransition] = useTransition();

  const handleClickCheckIn = () => {
    startTransition(async () => {
      await addCheckInAction(itemId);
    });
  };

  const handleClickBulk = () => {
    setOpen(true);
  };

  const handleBulkCheckIn = () => {
    startBulkTransition(async () => {
      const result = await addBulkCheckInsAction(itemId, bulk);
      if (result.success) {
        setOpen(false);
      }
    });
  };

  const handleClickBulkUser = (userId: string) => {
    if (bulk.includes(userId)) {
      setBulk(without([userId], bulk));
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
          {not(isEmpty(friends)) && (
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
        {not(isEmpty(checkIns)) && (
          <List>
            {(
              Object.entries(
                groupBy(
                  (x: CheckIn) => format(parseISO(x.createdAt), "yyyy-MM-dd"),
                  checkIns,
                ),
              ) as [string, CheckIn[]][]
            ).flatMap(([dateKey, x]) => [
              <ListDivider key={`divider-${dateKey}`} />,
              <ListItem key={dateKey}>
                <ListItemContent>
                  <AvatarGroup>
                    {x.map((y) => (
                      <Tooltip key={y.id} title={y.user.displayName}>
                        <UserAvatar avatarUrl={y.user.avatarUrl} displayName={y.user.displayName} />
                      </Tooltip>
                    ))}
                  </AvatarGroup>
                </ListItemContent>
                <Typography>
                  {format(parseISO(x[0].createdAt), "MM/dd/yyyy")}
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
                  <UserAvatar avatarUrl={user.avatarUrl} displayName={user.displayName} />
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
              disabled={isEmpty(bulk)}
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
