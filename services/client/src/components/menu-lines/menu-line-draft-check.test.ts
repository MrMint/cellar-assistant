import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formLayout } from "@/components/item/itemFormLayout";
import { draftToCheck } from "./menu-line-draft-check";

const valuesOf =
  (values: Record<string, string>) =>
  (path: string): string =>
    values[path] ?? "";

describe("draftToCheck — the 'n to check' beside Add to catalog (CROSS-LOT)", () => {
  test("counts the kind's floor fields that are still empty, in the form's order", () => {
    const layout = formLayout("WINE", "create");
    const open = draftToCheck(layout, valuesOf({ name: "House red" }));
    assert.ok(open.includes("attributes.style"), "a wine's style is a floor");
    assert.ok(open.includes("attributes.vintage"), "a wine asks year or NV");
    assert.ok(!open.includes("name"), "a filled name is not open");
  });

  test("a filled floor drops out; a field outside the floor never counts", () => {
    const layout = formLayout("SPIRIT", "create");
    const before = draftToCheck(layout, valuesOf({ name: "Rye" }));
    assert.deepEqual(before, ["attributes.spiritType"]);
    const after = draftToCheck(
      layout,
      valuesOf({ name: "Rye", "attributes.spiritType": "whiskey" }),
    );
    assert.deepEqual(after, []);
    // Country is never a floor: empty, it still does not count.
    assert.ok(!after.includes("country"));
  });

  test("whitespace is still empty", () => {
    const layout = formLayout("SPIRIT", "create");
    assert.deepEqual(
      draftToCheck(
        layout,
        valuesOf({ name: "  ", "attributes.spiritType": "whiskey" }),
      ),
      ["name"],
    );
  });
});
