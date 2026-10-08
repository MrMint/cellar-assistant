"use client";

import { useRouter } from "next/navigation";
import { type SubmitHandler, useForm } from "react-hook-form";
import { useMutation } from "urql";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import {
  ATTRIBUTE_INPUT_KEY,
  attributesToSave,
  missingRequiredAttributes,
} from "@/components/item-api/itemFormRules";
import { UpdateItemMutation } from "@/lib/api/items";
import { unwrapResult } from "@/lib/api/result";
import { requiredSummary } from "./form-errors";
import { ItemFormField } from "./ItemFormField";
import { dateFromYear, formLayout, yearFromDate } from "./itemFormLayout";
import { LoadingButton } from "./LoadingButton";

export type ItemFormValues = {
  name: string;
  description: string;
  country: string;
  /** By `ITEM_FORM_RULES` key, as strings; booleans are "true"/"false"/"". */
  attributes: Record<string, string>;
};

type ItemFormProps = {
  id: string;
  type: ApiItemType;
  defaultValues: ItemFormValues;
  /** Where a successful save goes (the page the edit was opened from). */
  onSavedHref: string;
};

/**
 * The six `82450ad1:src/components/{wine,…}/{T}Form.tsx` in edit mode, as one
 * form over `formLayout(type)` — capped at the `sm` breakpoint (600 px) as
 * the old `Box` was, labelled fields (`ItemFormField`, on `ui/field`),
 * `EnumSelect` for reference and enum columns, checkboxes for tea's two
 * flags, the same order
 * and labels, and the same "Something went wrong please try again..." root
 * error. A vintage is a year, as it was (see `dateFromYear`).
 *
 * What it sends is the rewrite's `updateItem` patch, unchanged: name blank is
 * ignored by the API (NOT NULL), description and country blank clear, an
 * attribute left blank is omitted (`attributesToSave`), and a column the
 * database requires is checked here first so the message names it.
 *
 * Button: "Save", where the old edit form still said "Add" (it was never
 * reachable — the old Edit button was hard-disabled).
 */
export const ItemForm = ({
  id,
  type,
  defaultValues,
  onSavedHref,
}: ItemFormProps) => {
  const router = useRouter();
  const [, updateItem] = useMutation(UpdateItemMutation);
  const layout = formLayout(type);

  const yearDefaults: Record<string, string> = {};
  for (const entry of layout) {
    if (entry.kind === "attribute" && entry.field.kind === "date") {
      yearDefaults[entry.field.key] = yearFromDate(
        defaultValues.attributes[entry.field.key] ?? "",
      );
    }
  }

  const {
    control,
    handleSubmit,
    getValues,
    setError,
    formState: { isSubmitting, errors },
  } = useForm<ItemFormValues>({
    defaultValues: {
      ...defaultValues,
      attributes: { ...defaultValues.attributes, ...yearDefaults },
    },
  });

  const onSubmit: SubmitHandler<ItemFormValues> = async (values) => {
    const attributes: Record<string, string> = { ...values.attributes };
    for (const key of Object.keys(yearDefaults)) {
      attributes[key] = dateFromYear(
        attributes[key] ?? "",
        defaultValues.attributes[key] ?? "",
      );
    }

    const missing = missingRequiredAttributes(type, attributes);
    if (missing.length > 0) {
      setError("root", {
        type: "custom",
        message: `${missing.map((field) => field.label).join(", ")} cannot be empty.`,
      });
      return;
    }

    const response = await updateItem({
      itemId: id,
      type,
      input: {
        name: values.name.trim() === "" ? null : values.name.trim(),
        description:
          values.description.trim() === "" ? null : values.description.trim(),
        country: values.country === "" ? null : values.country,
        [ATTRIBUTE_INPUT_KEY[type]]: attributesToSave(type, attributes),
      },
    });
    const saved = unwrapResult(
      response.data?.updateItem,
      "MutationUpdateItemSuccess",
    );
    if (!saved.ok) {
      setError("root", {
        type: "custom",
        message:
          saved.error.code === "VALIDATION" || saved.error.code === "FORBIDDEN"
            ? saved.error.message
            : "Something went wrong please try again...",
      });
      return;
    }
    router.push(onSavedHref);
    router.refresh();
  };

  // N03: validation stopped the submit — name the fields beside the button.
  const onInvalid = () => {
    setError("root", {
      type: "custom",
      message:
        requiredSummary(layout, getValues()) ?? "Check the highlighted fields.",
    });
  };

  return (
    <div className="w-full max-w-[600px]">
      {/* noValidate: required fields carry a native `required`, and the
          browser's own check would cancel the submit before react-hook-form
          runs — so none of N03's messages would ever show. */}
      <form noValidate onSubmit={handleSubmit(onSubmit, onInvalid)}>
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            {layout.map((entry) => (
              <ItemFormField
                key={entry.kind === "attribute" ? entry.field.key : entry.kind}
                entry={entry}
                control={control}
                disabled={isSubmitting}
              />
            ))}
          </div>
          {errors.root !== undefined && (
            <p role="alert" className="type-body text-destructive">
              {errors.root.message}
            </p>
          )}
          <LoadingButton loading={isSubmitting} type="submit">
            Save
          </LoadingButton>
        </div>
      </form>
    </div>
  );
};
