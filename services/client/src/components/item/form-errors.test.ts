import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { emptyFormValues } from "@/components/common/OnboardingWizard/adapter";
import {
  fieldErrorText,
  isRequired,
  missingRequiredLabels,
  requiredMessage,
  requiredRule,
  requiredSummary,
} from "./form-errors";
import { formLayout } from "./itemFormLayout";

describe("N03: required fields say what's wrong", () => {
  test("a required entry's rule carries its message", () => {
    const [name] = formLayout("WINE", "create");
    assert.ok(name !== undefined);
    assert.deepEqual(requiredRule(name), { required: "Name is required." });
    const description = formLayout("WINE").find(
      (e) => e.kind === "description",
    );
    assert.ok(description !== undefined);
    assert.equal(requiredRule(description), undefined);
  });

  test("coffee's NOT NULL description is starred and validated", () => {
    const description = formLayout("COFFEE").find(
      (e) => e.kind === "description",
    );
    assert.ok(description !== undefined && isRequired(description));
  });

  test("no error is ever silent", () => {
    assert.equal(fieldErrorText("Vintage", undefined), undefined);
    assert.equal(
      fieldErrorText("Vintage", { type: "required", message: "" }),
      requiredMessage("Vintage"),
    );
    assert.equal(
      fieldErrorText("Vintage", { type: "required", message: "Say a year." }),
      "Say a year.",
    );
    assert.equal(
      fieldErrorText("Vintage", { type: "min" }),
      "Vintage is not valid.",
    );
  });

  test("the summary names every missing field by the form's label", () => {
    const layout = formLayout("WINE", "create");
    const values = emptyFormValues();
    assert.deepEqual(missingRequiredLabels(layout, values), [
      "Name",
      "Vintage",
      "Style",
    ]);
    assert.equal(
      requiredSummary(layout, values),
      "Name, Vintage and Style are required.",
    );
    assert.equal(
      requiredSummary(layout, {
        ...values,
        name: "X",
        attributes: { vintage: "2015" },
      }),
      "Style is required.",
    );
    assert.equal(
      requiredSummary(layout, {
        ...values,
        name: "X",
        attributes: { vintage: "2015", style: "RED" },
      }),
      null,
    );
  });

  test("the create form's own stars count (sake's Vintage and Category)", () => {
    assert.deepEqual(
      missingRequiredLabels(formLayout("SAKE", "create"), {
        ...emptyFormValues(),
        name: "Dassai",
      }),
      ["Vintage", "Category"],
    );
    assert.deepEqual(
      missingRequiredLabels(formLayout("SAKE", "edit"), {
        ...emptyFormValues(),
        name: "Dassai",
      }),
      [],
    );
  });
});
