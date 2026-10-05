"use client";

import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Stack,
  Typography,
} from "@mui/joy";
import { Fragment, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { useClient } from "urql";
import { BrandPicker } from "@/components/brand/BrandPicker";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import type { ItemFormValues } from "@/components/item/ItemForm";
import { ItemFormField } from "@/components/item/ItemFormField";
import { formLayout } from "@/components/item/itemFormLayout";
import { createOnboardedItem } from "./actors/createItem";
import { type OnboardingDefaults, saveBlocker } from "./adapter";

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
 * what the onboarding wizard's `form` step rendered. Same `Box` capped at the
 * `sm` breakpoint, the same fields in the same order through the shared
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
  const layout = formLayout(type);
  const [brandName, setBrandName] = useState(defaultValues.brandName);
  const [barcode, setBarcode] = useState(sessionBarcode ?? "");

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
  } = useForm<ItemFormValues>({ defaultValues: defaultValues.values });

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
              <Fragment
                key={entry.kind === "attribute" ? entry.field.key : entry.kind}
              >
                <ItemFormField
                  entry={entry}
                  control={control}
                  disabled={isSubmitting}
                />
                {entry.kind === "description" && (
                  <BrandPicker
                    value={brandName}
                    onChange={setBrandName}
                    disabled={isSubmitting}
                  />
                )}
              </Fragment>
            ))}
            <FormControl>
              <FormLabel>Barcode</FormLabel>
              <Input
                disabled={isSubmitting}
                type="text"
                slotProps={{ input: { inputMode: "numeric" } }}
                value={barcode}
                onChange={(event) => setBarcode(event.target.value)}
              />
            </FormControl>
          </Stack>
          {errors.root !== undefined && (
            <Typography>{errors.root.message}</Typography>
          )}
          <Button loading={isSubmitting} type="submit">
            Add
          </Button>
        </Stack>
      </form>
    </Box>
  );
};
