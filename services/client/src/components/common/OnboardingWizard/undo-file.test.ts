/**
 * Undo on +1 (Capture-Place): it removes the bottle that +1 just added, and
 * never another cellar item — not an earlier bottle of the same drink, not
 * one in another cellar.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  type FiledBottle,
  filedBottleOf,
  type RemoveFromCellar,
  undoFiledBottle,
} from "./undo-file";

const stub = (answerId?: string) => {
  const sent: { cellarId: string; cellarItemId: string }[] = [];
  const remove: RemoveFromCellar = async (variables) => {
    sent.push({ ...variables });
    return {
      data: {
        removeItemFromCellar: {
          __typename: "RemovedCellarItem",
          id: answerId ?? variables.cellarItemId,
        },
      } as never,
    };
  };
  return { remove, sent };
};

describe("undoFiledBottle", () => {
  test("removes only the bottle +1 just added", async () => {
    const { remove, sent } = stub();
    // Two runs in one session: an earlier bottle, then this +1.
    const earlier = filedBottleOf({
      cellarId: "cellar-mine",
      cellarItemId: "bottle-earlier",
    });
    const justAdded = filedBottleOf({
      cellarId: "cellar-mine",
      cellarItemId: "bottle-just-added",
    });
    assert.ok(earlier !== undefined && justAdded !== undefined);
    await undoFiledBottle(remove, justAdded);
    assert.deepEqual(sent, [
      { cellarId: "cellar-mine", cellarItemId: "bottle-just-added" },
    ]);
  });

  test("an answer naming any other bottle is not a success", async () => {
    const { remove } = stub("bottle-earlier");
    const filed: FiledBottle = {
      cellarId: "cellar-mine",
      cellarItemId: "bottle-just-added",
    };
    await assert.rejects(undoFiledBottle(remove, filed));
  });

  test("a refusal is an error, never taken back", async () => {
    const remove: RemoveFromCellar = async () => ({
      data: {
        removeItemFromCellar: {
          __typename: "NotFoundError",
          code: "NOT_FOUND",
          reason: null,
          retryAt: null,
          message: "cellar item not found",
        },
      } as never,
    });
    await assert.rejects(
      undoFiledBottle(remove, { cellarId: "c", cellarItemId: "b" }),
      /not found/,
    );
  });
});

describe("filedBottleOf", () => {
  test("catalog only (no bottle kept) offers no Undo", () => {
    assert.equal(
      filedBottleOf({ cellarId: null, cellarItemId: "b" }),
      undefined,
    );
    assert.equal(filedBottleOf({ cellarId: "c" }), undefined);
  });
});
