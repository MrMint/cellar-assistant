import {
  Avatar,
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
import { addCheckIn, addCheckIns } from "@shared/queries";
import { format, parseISO } from "date-fns";
import { groupBy, isEmpty, mapObjIndexed, not, values, without } from "ramda";
import { useEffect, useState } from "react";
import { useMutation } from "urql";

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
  const [bulk, setBulk] = useState(new Array<string>());
  const [{ fetching }, addCheckInMutation] = useMutation(addCheckIn);
  const [{ fetching: bulkFetcing }, addCheckInsMutation] =
    useMutation(addCheckIns);

  const handleClickCheckIn = async () => {
    await addCheckInMutation({
      checkIn: {
        user_id: user.id,
        cellar_item_id: itemId,
      },
    });
  };

  const handleClickBulk = async () => {
    setOpen(true);
  };

  const handleBulkCheckIn = async () => {
    await addCheckInsMutation({
      checkIns: bulk.map((x) => ({
        user_id: x,
        cellar_item_id: itemId,
      })),
    });
    setOpen(false);
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
            loading={fetching}
            fullWidth
          >
            Check In
          </Button>
          {not(isEmpty(friends)) && (
            <Button
              variant="solid"
              color="primary"
              onClick={handleClickBulk}
              loading={fetching}
              fullWidth
            >
              Bulk Check In
            </Button>
          )}
        </Stack>
        {not(isEmpty(checkIns)) && (
          <List>
            {values(
              mapObjIndexed(
                (x: CheckIn[], i, groups) => (
                  <>
                    <ListDivider />
                    <ListItem key={x[0].id}>
                      <ListItemContent>
                        <AvatarGroup>
                          {x.map((y) => (
                            <Tooltip key={y.id} title={y.user.displayName}>
                              <Avatar src={y.user.avatarUrl} />
                            </Tooltip>
                          ))}
                        </AvatarGroup>
                      </ListItemContent>
                      <Typography>
                        {format(parseISO(x[0].createdAt), "MM/dd/yyyy")}
                      </Typography>
                    </ListItem>
                  </>
                ),
                groupBy(
                  (x) => format(parseISO(x.createdAt), "yyyy-MM-dd"),
                  checkIns,
                ),
              ),
            )}
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
                  <Avatar src={user.avatarUrl} />
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
              loading={bulkFetcing}
              onClick={handleBulkCheckIn}
              disabled={isEmpty(bulk)}
            >
              Check In
            </Button>
            <Button
              variant="plain"
              color="neutral"
              disabled={bulkFetcing}
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
