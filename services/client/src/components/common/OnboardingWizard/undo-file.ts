import type { ResultOf, VariablesOf } from "gql.tada";
import type { RemoveItemFromCellarMutation } from "@/lib/api/cellars";
import { unwrapResult } from "@/lib/api/result";

/** urql's `useMutation(RemoveItemFromCellarMutation)` executor, or a stub. */
export type RemoveFromCellar = (
  variables: VariablesOf<typeof RemoveItemFromCellarMutation>,
) => Promise<{ data?: ResultOf<typeof RemoveItemFromCellarMutation> | null }>;

/** The one bottle a +1 (or a camera shot) just put in a cellar. */
export type FiledBottle = {
  readonly cellarId: string;
  readonly cellarItemId: string;
};

/**
 * The bottle this run filed, taken from the machine's context at the moment
 * it lands, so a later run (Snap another) cannot change what Undo names.
 * Nothing when no bottle was kept (catalog only): there is nothing to undo.
 */
export const filedBottleOf = (context: {
  cellarId?: string | null;
  cellarItemId?: string | null;
}): FiledBottle | undefined =>
  context.cellarId === undefined ||
  context.cellarId === null ||
  context.cellarItemId === undefined ||
  context.cellarItemId === null
    ? undefined
    : { cellarId: context.cellarId, cellarItemId: context.cellarItemId };

/**
 * Capture-Place's one-tap Undo on +1: `removeItemFromCellar` for exactly the
 * bottle just filed, and nothing else. A refusal, or an answer naming any
 * other bottle, throws, so the caller never says "taken back" falsely.
 */
export const undoFiledBottle = async (
  remove: RemoveFromCellar,
  filed: FiledBottle,
): Promise<void> => {
  const result = unwrapResult(
    (
      await remove({
        cellarId: filed.cellarId,
        cellarItemId: filed.cellarItemId,
      })
    ).data?.removeItemFromCellar,
    "RemovedCellarItem",
  );
  if (!result.ok) throw new Error(result.error.message);
  if (result.data.id !== filed.cellarItemId) {
    throw new Error("A different bottle came back out.");
  }
};
