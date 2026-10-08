import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ITEM_TYPES } from "@/components/cellar-api/itemTypes";
import { emptyFormValues } from "@/components/common/OnboardingWizard/adapter";
import { ITEM_FORM_RULES } from "@/components/item-api/itemFormRules";
import {
  fieldErrorText,
  isRequired,
  missingRequiredLabels,
  requiredMessage,
  requiredRule,
  requiredSummary,
} from "./form-errors";
import { entryPath, formLayout } from "./itemFormLayout";

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

  // X19: `coffees.description` is nullable now, like the other five types'.
  test("coffee's description is optional", () => {
    const description = formLayout("COFFEE").find(
      (e) => e.kind === "description",
    );
    assert.ok(description !== undefined && !isRequired(description));
  });

  // X19: the column is nullable (NULL = non-vintage), but the form still
  // asks for a year or NV, in the edit form as well as the create one.
  test("a wine's vintage is starred in both forms", () => {
    for (const mode of ["create", "edit"] as const) {
      const vintage = formLayout("WINE", mode).find(
        (e) => entryPath(e) === "attributes.vintage",
      );
      assert.ok(vintage !== undefined && isRequired(vintage), mode);
    }
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

  test("the stars cover every column the database requires, in both modes", () => {
    // The onboarding form's submit line leads with the layout's summary; that
    // is only complete if no NOT NULL column goes unstarred.
    for (const type of ITEM_TYPES) {
      for (const mode of ["create", "edit"] as const) {
        const starred = new Set(
          formLayout(type, mode)
            .filter(isRequired)
            .map((entry) => entryPath(entry)),
        );
        const needed = [
          "name",
          ...(ITEM_FORM_RULES[type].descriptionRequired ? ["description"] : []),
          ...ITEM_FORM_RULES[type].attributes
            .filter((field) => field.required === true)
            .map((field) => `attributes.${field.key}`),
        ];
        for (const path of needed) {
          assert.ok(starred.has(path), `${type} ${mode}: ${path} is starred`);
        }
      }
    }
  });
});
