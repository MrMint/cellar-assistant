"use client";

import { Box, Button, Stack, Typography } from "@mui/joy";
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
import { ItemFormField } from "./ItemFormField";
import { dateFromYear, formLayout, yearFromDate } from "./itemFormLayout";

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
 * form over `formLayout(type)` — same `Box` capped at the `sm` breakpoint,
 * same stacks, same `FormControl`/`FormLabel`/`Input`, `EnumSelect` for
 * reference and enum columns, `Checkbox` for tea's two flags, the same order
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

  return (
    <Box
      sx={(theme) => ({
        maxWidth: theme.breakpoints.values.sm,
      })}
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <Stack spacing={4}>
          <Stack spacing={2}>
            {layout.map((entry) => (
              <ItemFormField
                key={entry.kind === "attribute" ? entry.field.key : entry.kind}
                entry={entry}
                control={control}
                disabled={isSubmitting}
              />
            ))}
          </Stack>
          {errors.root !== undefined && (
            <Typography>{errors.root.message}</Typography>
          )}
          <Button loading={isSubmitting} type="submit">
            Save
          </Button>
        </Stack>
      </form>
    </Box>
  );
};
