"use client";

import {
  Alert,
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  List,
  ListItem,
  Stack,
  Typography,
} from "@mui/joy";
import { Fragment, useState } from "react";
import { type SubmitHandler, useForm, useWatch } from "react-hook-form";
import { useClient } from "urql";
import { BrandPicker } from "@/components/brand/BrandPicker";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import type { ItemFormValues } from "@/components/item/ItemForm";
import { ItemFormField } from "@/components/item/ItemFormField";
import { requiredSummary } from "@/components/item/form-errors";
import { entryPath, formLayout } from "@/components/item/itemFormLayout";
import { draftedPaths, isDrafted } from "@/lib/forms/ai-draft";
import { AIDraftField } from "../AIDraftField";
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
  const layout = formLayout(type, "create");
  const [brandName, setBrandName] = useState(defaultValues.brandName);
  const [barcode, setBarcode] = useState(sessionBarcode ?? "");

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
  // as well as under each one. `saveBlocker` names the database's columns;
  // the layout's summary covers the create form's own stars (sake, tea).
  const onInvalid = () => {
    const values = getValues();
    setError("root", {
      type: "custom",
      message:
        saveBlocker(type, values) ??
        requiredSummary(layout, values) ??
        "Check the highlighted fields.",
    });
  };

  return (
    <Box
      sx={(theme) => ({
        maxWidth: theme.breakpoints.values.sm,
      })}
    >
      <form onSubmit={handleSubmit(onSubmit, onInvalid)}>
        <Stack spacing={4}>
          {notFilled.length > 0 && (
            <Alert color="neutral" variant="soft">
              <Stack spacing={0.5}>
                <Typography level="title-sm">
                  Read from the label but not filled in
                </Typography>
                <List size="sm" marker="disc">
                  {notFilled.map((note) => (
                    <ListItem key={note}>{note}</ListItem>
                  ))}
                </List>
              </Stack>
            </Alert>
          )}
          <Stack spacing={2}>
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
            <Typography color="danger" role="alert">
              {errors.root.message}
            </Typography>
          )}
          <Button loading={isSubmitting} type="submit">
            Add
          </Button>
        </Stack>
      </form>
    </Box>
  );
};
