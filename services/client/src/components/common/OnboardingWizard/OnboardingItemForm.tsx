"use client";

import { Fragment, useId, useState } from "react";
import { type SubmitHandler, useForm, useWatch } from "react-hook-form";
import { useClient } from "urql";
import { AIDraftField } from "@/components/app/AIDraftField";
import { Info } from "@/components/app/icons";
import { BrandPicker } from "@/components/brand/BrandPicker";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { requiredSummary } from "@/components/item/form-errors";
import type { ItemFormValues } from "@/components/item/ItemForm";
import { ItemFormField } from "@/components/item/ItemFormField";
import { entryPath, formLayout } from "@/components/item/itemFormLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { draftedPaths, isDrafted } from "@/lib/forms/ai-draft";
import { createOnboardedItem } from "./actors/createItem";
import { type OnboardingDefaults, saveBlocker, skippedNotes } from "./adapter";

type OnboardingItemFormProps = {
  type: ApiItemType;
  itemOnboardingId: string;
  defaultValues: OnboardingDefaults;
  /** The code the session was opened with — the scanner's, if it saw one. */
  sessionBarcode?: string;
  onCreated: (createdId: string) => void;
};

/**
 * The six `82450ad1:src/components/{type}/{T}Form.tsx` in **create** mode —
 * what the onboarding wizard's `form` step rendered. Same column capped at the
 * `sm` breakpoint (600 px), the same fields in the same order through the shared
 * `ItemFormField` (`item/itemFormLayout.ts`), `BrandPicker` after the
 * description as before, a Barcode field last, "Add", and the same
 * "Something went wrong please try again..." root error.
 *
 * The save is `createOnboardedItem` (confirm → wait for the row → typed
 * barcode), and a column the database requires is checked first so the
 * message names it instead of the outbox swallowing it.
 */
export const OnboardingItemForm = ({
  type,
  itemOnboardingId,
  defaultValues,
  sessionBarcode,
  onCreated,
}: OnboardingItemFormProps) => {
  const client = useClient();
  const layout = formLayout(type, "create");
  const [brandName, setBrandName] = useState(defaultValues.brandName);
  const [barcode, setBarcode] = useState(sessionBarcode ?? "");
  const barcodeId = useId();

  const {
    control,
    handleSubmit,
    getValues,
    setError,
    formState: { isSubmitting, errors },
  } = useForm<ItemFormValues>({ defaultValues: defaultValues.values });

  // N19: a field is marked "From label" while it still holds what was read.
  const current = useWatch({ control });
  const drafted = draftedPaths(defaultValues.values, current);
  const notFilled = skippedNotes(type, defaultValues.skipped);

  const onSubmit: SubmitHandler<ItemFormValues> = async (values) => {
    const blocker = saveBlocker(type, values);
    if (blocker !== null) {
      setError("root", { type: "custom", message: blocker });
      return;
    }
    try {
      const itemId = await createOnboardedItem({
        urqlClient: client,
        type,
        onboardingId: itemOnboardingId,
        values,
        brandName,
        barcode,
        sessionBarcode,
      });
      onCreated(itemId);
    } catch (cause) {
      setError("root", {
        type: "custom",
        message:
          cause instanceof Error
            ? cause.message
            : "Something went wrong please try again...",
      });
    }
  };

  // N03: validation stopped the submit — say which fields, beside the button,
  // as well as under each one. The layout's summary names every starred field
  // still blank, which includes every column `saveBlocker` checks plus the
  // create form's own stars (sake, tea) — so it leads, and `saveBlocker` only
  // speaks when the stars are all filled (a whitespace-only value, which
  // `required` lets through, is caught by it here and again in `onSubmit`).
  const onInvalid = () => {
    const values = getValues();
    setError("root", {
      type: "custom",
      message:
        requiredSummary(layout, values) ??
        saveBlocker(type, values) ??
        "Check the highlighted fields.",
    });
  };

  return (
    <div className="max-w-[600px]">
      {/* noValidate: the required fields carry a native `required`, and the
          browser's own check would cancel the submit before react-hook-form
          runs — so none of N03's messages would ever show. */}
      <form noValidate onSubmit={handleSubmit(onSubmit, onInvalid)}>
        <div className="flex flex-col gap-8">
          {notFilled.length > 0 && (
            <Alert>
              <Info aria-hidden />
              <AlertTitle>Read from the label but not filled in</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5">
                  {notFilled.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-4">
            {layout.map((entry) => (
              <Fragment
                key={entry.kind === "attribute" ? entry.field.key : entry.kind}
              >
                <AIDraftField
                  source="label"
                  drafted={drafted.has(entryPath(entry))}
                >
                  <ItemFormField
                    entry={entry}
                    control={control}
                    disabled={isSubmitting}
                  />
                </AIDraftField>
                {entry.kind === "description" && (
                  <AIDraftField
                    source="label"
                    drafted={isDrafted(defaultValues.brandName, brandName)}
                  >
                    <BrandPicker
                      value={brandName}
                      onChange={setBrandName}
                      disabled={isSubmitting}
                    />
                  </AIDraftField>
                )}
              </Fragment>
            ))}
            {/* AIDraftField gives every field above a 2 px rule and 12 px
                inset whether or not it is drafted; the same inset keeps
                Barcode's label in their column. `gap-2 text-foreground` is
                ItemFormField's: without it the label and value inherit Joy's
                body ink (ink-2) and sit further from the input than the
                fields above. */}
            <Field
              data-disabled={isSubmitting || undefined}
              className="gap-2 border-transparent border-l-2 pl-3 text-foreground"
            >
              <FieldLabel htmlFor={barcodeId}>Barcode</FieldLabel>
              <Input
                id={barcodeId}
                disabled={isSubmitting}
                type="text"
                inputMode="numeric"
                value={barcode}
                onChange={(event) => setBarcode(event.target.value)}
              />
            </Field>
          </div>
          {errors.root !== undefined && (
            <p role="alert" className="type-body text-destructive">
              {errors.root.message}
            </p>
          )}
          <Button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting || undefined}
          >
            {isSubmitting && <Spinner aria-hidden />}
            Add
          </Button>
        </div>
      </form>
    </div>
  );
};
