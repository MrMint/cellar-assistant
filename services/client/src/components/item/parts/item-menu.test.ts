import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { addLabel, itemMenu } from "./item-menu";

const actions = (entries: ReturnType<typeof itemMenu>) =>
  entries.map((entry) => entry.action);

describe("itemMenu (Cellars-Pour's menu, CROSS-LOT)", () => {
  const base = {
    addLabel: "Add to Home",
    editHref: null,
    ownedBottle: false,
    canMove: false,
    canRemoveRating: false,
  };

  test("everyone gets Add to a list, the add, and Share, in that order", () => {
    assert.deepEqual(actions(itemMenu(base)), ["list", "add", "share"]);
  });

  test("no add when you have no cellar to add to", () => {
    assert.deepEqual(actions(itemMenu({ ...base, addLabel: null })), [
      "list",
      "share",
    ]);
  });

  test("the creator gets Edit details", () => {
    assert.ok(
      actions(itemMenu({ ...base, editHref: "/x/edit" })).includes("edit"),
    );
  });

  test("your bottle: Move when there is another cellar, Delete last and destructive", () => {
    const entries = itemMenu({ ...base, ownedBottle: true, canMove: true });
    assert.deepEqual(actions(entries), [
      "list",
      "add",
      "share",
      "move",
      "delete",
    ]);
    assert.equal(entries.at(-1)?.destructive, true);
  });

  test("no Move without another cellar, and never for a bottle not yours", () => {
    assert.ok(
      !actions(itemMenu({ ...base, ownedBottle: true })).includes("move"),
    );
    assert.ok(!actions(itemMenu({ ...base, canMove: true })).includes("move"));
  });

  test("rated, not owned: Remove my rating last, never beside Delete (L7)", () => {
    assert.equal(
      itemMenu({ ...base, canRemoveRating: true }).at(-1)?.action,
      "removeRating",
    );
    const owned = actions(
      itemMenu({ ...base, ownedBottle: true, canRemoveRating: true }),
    );
    assert.ok(owned.includes("delete"));
    assert.ok(!owned.includes("removeRating"));
  });
});

describe("addLabel", () => {
  test("names the one cellar, and says another when you hold one", () => {
    assert.equal(addLabel([{ id: "c", name: "Home" }], 0), "Add to Home");
    assert.equal(
      addLabel([{ id: "c", name: "Home" }], 2),
      "Add another to Home",
    );
  });
  test("several cellars: the plain verb", () => {
    const two = [
      { id: "a", name: "Home" },
      { id: "b", name: "Garage" },
    ];
    assert.equal(addLabel(two, 0), "Add to cellar");
    assert.equal(addLabel(two, 1), "Add another bottle");
  });
  test("none: no add", () => {
    assert.equal(addLabel([], 0), null);
  });
});
