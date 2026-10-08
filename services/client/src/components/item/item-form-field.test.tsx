/**
 * N03 in the markup: a field holding a validation error is drawn as an error
 * (`FormControl error`) with a line saying what is wrong under it.
 *
 * `useForm({ errors })` seeds the errors the way a failed submit would leave
 * them, so a static render can show the state.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { type FieldErrors, useForm } from "react-hook-form";

mock.module("@/components/item-api/useReferenceOptions", () => ({
  useReferenceOptions: () => ({
    optionsFor: () => [{ value: "RED", comment: null }],
    countries: [],
    fetching: false,
    error: undefined,
  }),
}));

const { ItemFormField } = await import("./ItemFormField");
const { formLayout } = await import("./itemFormLayout");
const { emptyFormValues } = await import(
  "@/components/common/OnboardingWizard/adapter"
);
type Values = ReturnType<typeof emptyFormValues>;

const layout = formLayout("WINE", "create");
const entry = (label: string) => {
  const found = layout.find((e) => e.label === label);
  if (found === undefined) throw new Error(label);
  return found;
};

const render = (label: string, errors?: FieldErrors<Values>) => {
  function Harness() {
    const { control } = useForm<Values>({
      defaultValues: emptyFormValues(),
      errors,
    });
    return (
      <ItemFormField entry={entry(label)} control={control} disabled={false} />
    );
  }
  return renderToStaticMarkup(<Harness />).replace(
    /<style[^>]*>[^<]*<\/style>/g,
    "",
  );
};

describe("ItemFormField errors (N03)", () => {
  test("a valid field draws no error", () => {
    const html = render("Vintage");
    assert.doesNotMatch(html, /Mui-error/);
    assert.doesNotMatch(html, /is required/);
  });

  test("a missing text field says so under itself", () => {
    const html = render("Vintage", {
      attributes: { vintage: { type: "required", message: "" } },
    } as FieldErrors<Values>);
    assert.match(html, /Mui-error/);
    assert.match(html, /MuiFormHelperText-root[^>]*>Vintage is required\./);
  });

  test("the name, and a missing picker, too", () => {
    assert.match(
      render("Name", {
        name: { type: "required", message: "Name is required." },
      }),
      />Name is required\.</,
    );
    assert.match(
      render("Style", {
        attributes: { style: { type: "required", message: "" } },
      } as FieldErrors<Values>),
      />Style is required\.</,
    );
  });
});
