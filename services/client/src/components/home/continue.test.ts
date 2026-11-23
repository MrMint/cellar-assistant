/**
 * Continue (X10): a `me.openBottles` node as the shelf and Drink soon read
 * it — above all, that each type's style field reaches the D29 table under
 * the name the table keys on.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { openBottleFromNode, openBottlesFromNodes } from "./continue";
import { openLifeFor } from "./drink-soon";

type Node = Parameters<typeof openBottleFromNode>[0];

const node = (item: Record<string, unknown> | null, id = "b1"): Node =>
  ({
    __typename: "CellarItem",
    id,
    cellarId: "c1",
    openAt: "2026-10-01T12:00:00.000Z",
    emptyAt: null,
    percentageRemaining: 60,
    cellar: { __typename: "Cellar", id: "c1", name: "Garage" },
    displayImage: null,
    item,
  }) as unknown as Node;

const base = { id: "i1", name: "barolo", country: null };

describe("openBottleFromNode", () => {
  test("a wine's style, vintage and cellar", () => {
    const bottle = openBottleFromNode(
      node({
        ...base,
        __typename: "Wine",
        type: "WINE",
        vintage: "2016",
        wineStyle: "RED",
        region: null,
        alcoholContentPercentage: null,
      }),
    );
    assert.ok(bottle);
    assert.equal(bottle.style, "RED");
    assert.equal(bottle.cellarName, "Garage");
    assert.match(bottle.title, /^2016 /);
    assert.equal(openLifeFor(bottle)?.label, "red wine");
  });

  test("each type's style field is the one the table reads", () => {
    const cases: [Record<string, unknown>, string | null, string | null][] = [
      [
        { __typename: "Sake", type: "SAKE", category: "namazake" },
        "namazake",
        "namazake",
      ],
      [
        { __typename: "Spirit", type: "SPIRIT", spiritType: "BOURBON" },
        "BOURBON",
        "bourbon",
      ],
      [
        { __typename: "Tea", type: "TEA", category: "green", form: null },
        "green",
        "green tea",
      ],
      [
        {
          __typename: "Tea",
          type: "TEA",
          category: "green",
          form: "matcha_powder",
        },
        "green",
        "matcha",
      ],
      [{ __typename: "Beer", type: "BEER" }, null, "beer"],
      [{ __typename: "Coffee", type: "COFFEE" }, null, "coffee beans"],
    ];
    for (const [fields, style, label] of cases) {
      const bottle = openBottleFromNode(node({ ...base, ...fields }));
      assert.ok(bottle, String(fields.type));
      assert.equal(bottle.style, style, String(fields.type));
      assert.equal(openLifeFor(bottle)?.label ?? null, label);
    }
  });

  test("B03: the plate's vessel fields reach Home (H-1)", () => {
    const wine = openBottleFromNode(
      node({
        ...base,
        __typename: "Wine",
        type: "WINE",
        wineStyle: "RED",
        variety: "PINOT_NOIR",
      }),
    );
    assert.deepEqual(wine?.styleFields, {
      style: "RED",
      variety: "PINOT_NOIR",
      form: null,
    });
    const beer = openBottleFromNode(
      node({ ...base, __typename: "Beer", type: "BEER", beerStyle: "IPA" }),
    );
    assert.deepEqual(beer?.styleFields, {
      style: "IPA",
      variety: null,
      form: null,
    });
    assert.equal(openLifeFor(beer ?? ({} as never))?.label, "beer");
    const tea = openBottleFromNode(
      node({ ...base, __typename: "Tea", type: "TEA", form: "loose_leaf" }),
    );
    assert.equal(tea?.styleFields.form, "loose_leaf");
  });

  test("a bottle whose item the server nulled is dropped, not drawn", () => {
    assert.equal(openBottleFromNode(node(null)), null);
    assert.deepEqual(
      openBottlesFromNodes([
        node(null, "gone"),
        node({ ...base, __typename: "Beer", type: "BEER" }, "kept"),
      ]).map((bottle) => bottle.id),
      ["kept"],
    );
  });
});
