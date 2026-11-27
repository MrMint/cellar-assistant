/**
 * C2's item-page writes, each with the wrong write it must never make:
 *
 * - Move (MC-move, L13): only the owner of the bottle, only into a cellar the
 *   page offered (yours or co-owned), never "into" the cellar it is in. The
 *   call names the bottle's own cellar as the source and the target in
 *   `input.cellarId`; Undo moves it back.
 * - Remove my rating (L7): only for an item you rated and do not own a
 *   bottle of; it deletes your own review by its id, and Undo re-creates it
 *   with the same score and note.
 * - Check in: only your own bottle that is not finished; Undo removes
 *   exactly the entry the check-in minted.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  canRemoveMyRating,
  checkInBottle,
  moveBottle,
  moveTargets,
  removeMyRating,
} from "./item-writes";

type Call = { name: string; variables: Record<string, unknown> };

const recorder = (
  answer: (name: string) => unknown = (name) => ({ __typename: name }),
) => {
  const calls: Call[] = [];
  const exec =
    (name: string, field: string) =>
    async (variables: Record<string, unknown>) => {
      calls.push({ name, variables });
      return { data: { [field]: answer(name) } };
    };
  return { calls, exec };
};

const cellars = [
  { id: "c-home", name: "Home" },
  { id: "c-garage", name: "Garage" },
];
const bottle = { id: "b-1", cellarId: "c-home", isOwner: true };

describe("moveTargets", () => {
  test("offers your other cellars, never the one the bottle is in", () => {
    assert.deepEqual(moveTargets(cellars, "c-home"), [
      { id: "c-garage", name: "Garage" },
    ]);
  });
});

describe("moveBottle", () => {
  test("moves your bottle into one of your other cellars, and Undo moves it back", async () => {
    const { calls, exec } = recorder(() => ({ __typename: "CellarItem" }));
    const result = await moveBottle(exec("move", "updateCellarItem"), {
      bottle,
      to: "c-garage",
      targets: moveTargets(cellars, bottle.cellarId),
    });
    assert.equal(result.ok, true);
    assert.deepEqual(calls[0]?.variables, {
      cellarId: "c-home",
      cellarItemId: "b-1",
      input: { cellarId: "c-garage" },
    });
    assert.ok(result.ok);
    await result.undo();
    assert.deepEqual(calls[1]?.variables, {
      cellarId: "c-garage",
      cellarItemId: "b-1",
      input: { cellarId: "c-home" },
    });
  });

  test("refuses a bottle that is not yours, and writes nothing", async () => {
    const { calls, exec } = recorder();
    const result = await moveBottle(exec("move", "updateCellarItem"), {
      bottle: { ...bottle, isOwner: false },
      to: "c-garage",
      targets: moveTargets(cellars, bottle.cellarId),
    });
    assert.equal(result.ok, false);
    assert.equal(calls.length, 0);
  });

  test("refuses a cellar the page did not offer (someone else's), and writes nothing", async () => {
    const { calls, exec } = recorder();
    const result = await moveBottle(exec("move", "updateCellarItem"), {
      bottle,
      to: "c-strangers",
      targets: moveTargets(cellars, bottle.cellarId),
    });
    assert.equal(result.ok, false);
    assert.equal(calls.length, 0);
  });

  test("refuses the cellar it is already in", async () => {
    const { calls, exec } = recorder();
    const result = await moveBottle(exec("move", "updateCellarItem"), {
      bottle,
      to: "c-home",
      targets: cellars,
    });
    assert.equal(result.ok, false);
    assert.equal(calls.length, 0);
  });

  test("says what the API refused", async () => {
    const { exec } = recorder(() => ({
      __typename: "ForbiddenError",
      message: "Not your cellar",
    }));
    const result = await moveBottle(exec("move", "updateCellarItem"), {
      bottle,
      to: "c-garage",
      targets: moveTargets(cellars, bottle.cellarId),
    });
    assert.equal(result.ok, false);
    assert.ok(!result.ok);
    assert.equal(result.message, "Not your cellar");
  });
});

const review = { id: "r-mine", score: 4.5, text: '{"root":"note"}' };

describe("canRemoveMyRating", () => {
  test("only for an item you rated and own no bottle of", () => {
    assert.equal(
      canRemoveMyRating({ myReview: review, ownsBottle: false }),
      true,
    );
    assert.equal(
      canRemoveMyRating({ myReview: review, ownsBottle: true }),
      false,
    );
    assert.equal(
      canRemoveMyRating({ myReview: null, ownsBottle: false }),
      false,
    );
  });
});

describe("removeMyRating", () => {
  test("deletes your own review by its id; Undo re-creates the same score and note", async () => {
    const { calls, exec } = recorder((name) =>
      name === "delete"
        ? { __typename: "DeletedItemReview", id: "r-mine" }
        : { __typename: "ItemReview", id: "r-new" },
    );
    const result = await removeMyRating(
      {
        deleteReview: exec("delete", "deleteItemReview"),
        addReview: exec("add", "addItemReview"),
        newId: () => "r-new",
      },
      { itemId: "i-1", type: "BEER", myReview: review, ownsBottle: false },
    );
    assert.ok(result.ok);
    assert.deepEqual(calls[0], {
      name: "delete",
      variables: { itemId: "i-1", type: "BEER", reviewId: "r-mine" },
    });
    const undone = await result.undo();
    assert.equal(undone.ok, true);
    assert.deepEqual(calls[1], {
      name: "add",
      variables: {
        itemId: "i-1",
        type: "BEER",
        input: { reviewId: "r-new", score: 4.5, text: '{"root":"note"}' },
      },
    });
  });

  test("Undo keeps a review with no note as one with no note", async () => {
    const { calls, exec } = recorder((name) =>
      name === "delete"
        ? { __typename: "DeletedItemReview", id: "r-mine" }
        : { __typename: "ItemReview", id: "r-new" },
    );
    const result = await removeMyRating(
      {
        deleteReview: exec("delete", "deleteItemReview"),
        addReview: exec("add", "addItemReview"),
        newId: () => "r-new",
      },
      {
        itemId: "i-1",
        type: "BEER",
        myReview: { ...review, text: null },
        ownsBottle: false,
      },
    );
    assert.ok(result.ok);
    await result.undo();
    assert.deepEqual(calls[1]?.variables.input, {
      reviewId: "r-new",
      score: 4.5,
    });
  });

  test("refuses an item you own a bottle of (Delete is the way), and writes nothing", async () => {
    const { calls, exec } = recorder();
    const result = await removeMyRating(
      {
        deleteReview: exec("delete", "deleteItemReview"),
        addReview: exec("add", "addItemReview"),
      },
      { itemId: "i-1", type: "BEER", myReview: review, ownsBottle: true },
    );
    assert.equal(result.ok, false);
    assert.equal(calls.length, 0);
  });

  test("refuses when you have no rating, and writes nothing", async () => {
    const { calls, exec } = recorder();
    const result = await removeMyRating(
      {
        deleteReview: exec("delete", "deleteItemReview"),
        addReview: exec("add", "addItemReview"),
      },
      { itemId: "i-1", type: "BEER", myReview: null, ownsBottle: false },
    );
    assert.equal(result.ok, false);
    assert.equal(calls.length, 0);
  });
});

describe("checkInBottle", () => {
  const open = {
    id: "b-1",
    cellarId: "c-home",
    isOwner: true,
    emptyAt: null,
  };

  test("checks in to your open bottle with a minted id; Undo deletes that entry alone", async () => {
    const { calls, exec } = recorder((name) =>
      name === "checkIn"
        ? { __typename: "CheckIn", id: "k-1" }
        : { __typename: "DeletedDrinkLogPayload" },
    );
    const result = await checkInBottle(
      {
        checkIn: exec("checkIn", "checkIn"),
        deleteLog: exec("deleteLog", "deleteDrinkLog"),
        newId: () => "k-1",
      },
      open,
    );
    assert.ok(result.ok);
    assert.deepEqual(calls[0]?.variables, {
      cellarId: "c-home",
      cellarItemId: "b-1",
      checkInId: "k-1",
    });
    await result.undo();
    assert.deepEqual(calls[1]?.variables, { id: "k-1" });
  });

  test("refuses someone else's bottle and a finished one, writing nothing", async () => {
    const { calls, exec } = recorder();
    const deps = {
      checkIn: exec("checkIn", "checkIn"),
      deleteLog: exec("deleteLog", "deleteDrinkLog"),
    };
    assert.equal(
      (await checkInBottle(deps, { ...open, isOwner: false })).ok,
      false,
    );
    assert.equal(
      (await checkInBottle(deps, { ...open, emptyAt: "2026-01-01T00:00:00Z" }))
        .ok,
      false,
    );
    assert.equal(calls.length, 0);
  });
});
