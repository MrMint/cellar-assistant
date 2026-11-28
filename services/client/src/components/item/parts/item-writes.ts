import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import type { DeleteDrinkLogMutation } from "@/components/drink-log/queries";
import type {
  CheckInMutation,
  UpdateCellarItemMutation,
} from "@/lib/api/cellars";
import type { ResultOf, VariablesOf } from "@/lib/api/graphql";
import type {
  AddItemReviewMutation,
  DeleteItemReviewMutation,
} from "@/lib/api/items";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";

/**
 * C2's item-page writes as plain functions over urql's executors, so each
 * guard — the wrong write it must never make — is tested without a page
 * (`item-writes.test.ts`). Every guard refuses before any call: a refused
 * write sends nothing.
 */

/** What urql's `useMutation` executor returns, as far as these read it. */
type Exec<TDoc> = (
  variables: VariablesOf<TDoc>,
) => Promise<{ data?: ResultOf<TDoc> | null; error?: unknown }>;

type Failed = { ok: false; message: string };
export type WriteResult = { ok: true } | Failed;
export type UndoableResult =
  | { ok: true; undo: () => Promise<WriteResult> }
  | Failed;

const refused = (message: string): Failed => ({ ok: false, message });

const transport = (error: unknown): Failed =>
  refused(
    failureFromTransport(error as Parameters<typeof failureFromTransport>[0])
      .message,
  );

const newUuid = () => crypto.randomUUID();

// ── Move (MC-move, L13) ─────────────────────────────────────────────────

export type MoveTarget = { id: string; name: string };

/** The cellars a bottle may move to: the ones offered, less its own. */
export const moveTargets = (
  cellars: readonly MoveTarget[],
  fromCellarId: string,
): MoveTarget[] => cellars.filter((cellar) => cellar.id !== fromCellarId);

/**
 * Move a bottle of yours to another of your cellars. It loses its shelf
 * `location` (the API clears it); its rating, note and logs stay. Undo moves
 * it back (the shelf does not come back: the API never had it to give).
 */
export async function moveBottle(
  update: Exec<typeof UpdateCellarItemMutation>,
  {
    bottle,
    to,
    targets,
  }: {
    bottle: { id: string; cellarId: string; isOwner: boolean };
    to: string;
    targets: readonly MoveTarget[];
  },
): Promise<UndoableResult> {
  if (!bottle.isOwner) return refused("Only its owner can move this bottle");
  if (to === bottle.cellarId) return refused("It is already there");
  if (!targets.some((target) => target.id === to)) {
    return refused("You can only move it to one of your cellars");
  }
  const send = async (from: string, into: string): Promise<WriteResult> => {
    const response = await update({
      cellarId: from,
      cellarItemId: bottle.id,
      input: { cellarId: into },
    });
    if (response.error) return transport(response.error);
    const result = unwrapResult(response.data?.updateCellarItem, "CellarItem");
    return result.ok ? { ok: true } : refused(result.error.message);
  };
  const moved = await send(bottle.cellarId, to);
  if (!moved.ok) return moved;
  return { ok: true, undo: () => send(to, bottle.cellarId) };
}

// ── Remove my rating (L7) ───────────────────────────────────────────────

export type MyReview = { id: string; score: number; text: string | null };

/** L7: offered for an item you rated and own no bottle of. */
export const canRemoveMyRating = ({
  myReview,
  ownsBottle,
}: {
  myReview: MyReview | null;
  ownsBottle: boolean;
}): boolean => myReview !== null && !ownsBottle;

/**
 * Delete your own review — score and note together, since `score` is NOT
 * NULL — and hand back an Undo that re-creates both as they were.
 */
export async function removeMyRating(
  deps: {
    deleteReview: Exec<typeof DeleteItemReviewMutation>;
    addReview: Exec<typeof AddItemReviewMutation>;
  },
  {
    itemId,
    type,
    myReview,
    ownsBottle,
  }: {
    itemId: string;
    type: ApiItemType;
    myReview: MyReview | null;
    ownsBottle: boolean;
  },
): Promise<UndoableResult> {
  if (myReview === null || !canRemoveMyRating({ myReview, ownsBottle })) {
    return refused("There is no rating of yours to remove here");
  }
  const response = await deps.deleteReview({
    itemId,
    type,
    reviewId: myReview.id,
  });
  if (response.error) return transport(response.error);
  const deleted = unwrapResult(
    response.data?.deleteItemReview,
    "DeletedItemReview",
  );
  if (!deleted.ok) return refused(deleted.error.message);

  const undo = async (): Promise<WriteResult> => {
    const again = await deps.addReview({
      itemId,
      type,
      input: {
        // F-148: the same id, so Undo puts back the review that was removed
        // rather than a new one. Its `createdAt` is still the server's new
        // stamp: `AddItemReviewInput` takes none (a server hand-off).
        reviewId: myReview.id,
        score: myReview.score,
        ...(myReview.text === null ? {} : { text: myReview.text }),
      },
    });
    if (again.error) return transport(again.error);
    const result = unwrapResult(again.data?.addItemReview, "ItemReview");
    return result.ok ? { ok: true } : refused(result.error.message);
  };
  return { ok: true, undo };
}

// ── Check in ────────────────────────────────────────────────────────────

/**
 * One tap on your own open (or sealed) bottle: a `checkIn` with an id minted
 * here, so a retry writes one entry and Undo removes exactly that one.
 */
export async function checkInBottle(
  deps: {
    checkIn: Exec<typeof CheckInMutation>;
    deleteLog: Exec<typeof DeleteDrinkLogMutation>;
    newId?: () => string;
  },
  bottle: {
    id: string;
    cellarId: string;
    isOwner: boolean;
    emptyAt: string | null;
  },
): Promise<UndoableResult> {
  if (!bottle.isOwner) return refused("Only its owner checks in from here");
  if (bottle.emptyAt !== null) return refused("This bottle is finished");
  const checkInId = (deps.newId ?? newUuid)();
  const response = await deps.checkIn({
    cellarId: bottle.cellarId,
    cellarItemId: bottle.id,
    checkInId,
  });
  if (response.error) return transport(response.error);
  const result = unwrapResult(response.data?.checkIn, "CheckIn");
  if (!result.ok) return refused(result.error.message);

  const undo = async (): Promise<WriteResult> => {
    const removed = await deps.deleteLog({ id: checkInId });
    if (removed.error) return transport(removed.error);
    const gone = unwrapResult(
      removed.data?.deleteDrinkLog,
      "DeletedDrinkLogPayload",
    );
    return gone.ok ? { ok: true } : refused(gone.error.message);
  };
  return { ok: true, undo };
}
