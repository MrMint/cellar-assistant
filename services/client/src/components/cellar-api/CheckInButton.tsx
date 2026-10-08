"use client";

import {
  useCallback,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { useMutation, useQuery } from "urql";
import { Check, Cocktail } from "@/components/app/icons";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { TogglePop } from "@/components/app/TogglePop";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
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
 *
 * The Joy `Dropdown` menu is a `ui/dropdown-menu` (still a `menu` of
 * `menuitem`s, which e2e 04 drives), non-modal; the picker `Modal` is a
 * `ResponsiveDialog` (a sheet on phones). "Me and friends…" opens the picker
 * only once the menu has gone and handed focus back to "Check in": opened
 * from `onSelect`, the picker mounted while the menu was still animating out,
 * took the doomed menu item as the place to return focus to, and dropped it
 * on `<body>` when it closed (Radix's own dropdown-to-dialog pattern).
 *
 * "Just me" answers in the tap's frame (X24): the glass becomes a popped
 * check while the write runs — no spinner — and the history below catches up
 * when `onCheckedIn` refreshes the page. The trigger stays held while it
 * runs (a check-in is a drink: a double tap must not log two); a refusal
 * puts the glass back and shows why.
 */
export function CheckInButton({
  cellarId,
  cellarItemId,
  itemName,
  viewerId,
  onCheckedIn,
}: {
  cellarId: string;
  cellarItemId: string;
  itemName: string;
  /** Included in `bulkCheckIn`'s ids, so "me and friends" means what it says. */
  viewerId: string | null;
  onCheckedIn?: () => void;
}) {
  const [error, setError] = useState<ApiFailure | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const checkboxIdPrefix = useId();
  /** "Me and friends…" was chosen; open the picker when the menu is gone. */
  const pickerPending = useRef(false);

  const [, checkIn] = useMutation(CheckInMutation);
  const [checkingIn, startCheckIn] = useTransition();
  const [checkedIn, setCheckedIn] = useOptimistic(false);
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

  const checkInSelf = useCallback(() => {
    startCheckIn(async () => {
      setError(null);
      setCheckedIn(true);
      const response = await checkIn({
        cellarId,
        cellarItemId,
        checkInId: crypto.randomUUID(),
      });
      const result = unwrapResult(
        response.data?.checkIn ?? undefined,
        "CheckIn",
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCheckedIn?.();
    });
  }, [checkIn, cellarId, cellarItemId, onCheckedIn, setCheckedIn]);

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
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            className="w-full"
            disabled={checkingIn}
            aria-busy={checkingIn || undefined}
          >
            <TogglePop on={checkedIn}>
              {checkedIn ? (
                <Check aria-hidden className="text-success" />
              ) : (
                <Cocktail aria-hidden />
              )}
            </TogglePop>
            Check in
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={() => {
            // Runs as the menu unmounts, just before it focuses the trigger;
            // the picker mounts after that and so restores focus there.
            if (!pickerPending.current) return;
            pickerPending.current = false;
            setError(null);
            setSelected([]);
            setBulkOpen(true);
          }}
        >
          <DropdownMenuItem className="min-h-11" onSelect={checkInSelf}>
            Just me
          </DropdownMenuItem>
          <DropdownMenuItem
            className="min-h-11"
            onSelect={() => {
              pickerPending.current = true;
            }}
          >
            Me and friends…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {error !== null && !bulkOpen && <ApiError error={error} />}

      <ResponsiveDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title="Who is drinking?"
        description={itemName}
        footer={
          <div className="flex w-full flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button variant="ghost" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={selected.length === 0 || bulkState.fetching}
              aria-busy={bulkState.fetching || undefined}
              onClick={() => void checkInTable()}
            >
              {bulkState.fetching && <Spinner aria-hidden />}
              Check in {selected.length > 0 ? `(${selected.length})` : ""}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          {friends.length === 0 ? (
            <p className="type-callout text-ink-3">
              You have no friends to check in for yet.
            </p>
          ) : (
            <ul className="flex flex-col">
              {friends.map((friend) => {
                const checkboxId = `${checkboxIdPrefix}-${friend.id}`;
                return (
                  <li key={friend.id}>
                    <label
                      htmlFor={checkboxId}
                      className="type-body flex min-h-11 items-center gap-3"
                    >
                      <Checkbox
                        id={checkboxId}
                        checked={selected.includes(friend.id)}
                        onCheckedChange={() => toggle(friend.id)}
                      />
                      {friend.displayName}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {error !== null && <ApiError error={error} />}
        </div>
      </ResponsiveDialog>
    </>
  );
}
