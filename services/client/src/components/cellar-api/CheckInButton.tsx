"use client";

import { useCallback, useId, useState } from "react";
import { useMutation, useQuery } from "urql";
import { Cocktail } from "@/components/app/icons";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
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
 * `menuitem`s, which e2e 04 drives), non-modal so that "Me and friends…" can
 * open the picker without racing the menu's own teardown; the picker `Modal`
 * is a `ResponsiveDialog` (a sheet on phones).
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
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            className="w-full"
            disabled={checkInState.fetching}
            aria-busy={checkInState.fetching || undefined}
          >
            {checkInState.fetching ? <Spinner aria-hidden /> : <Cocktail />}
            Check in
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="min-h-11"
            onSelect={() => void checkInSelf()}
          >
            Just me
          </DropdownMenuItem>
          <DropdownMenuItem
            className="min-h-11"
            onSelect={() => {
              setError(null);
              setSelected([]);
              setBulkOpen(true);
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
