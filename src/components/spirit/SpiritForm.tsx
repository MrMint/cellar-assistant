"use client";

import {
  Barcodes_Constraint,
  Barcodes_Update_Column,
  type Country_Enum,
  type Spirit_Type_Enum,
} from "@cellar-assistant/shared";
import {
  addSpiritMutation,
  type Spirits_Insert_Input,
  updateSpiritMutation,
} from "@cellar-assistant/shared/queries";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Stack,
  Textarea,
  Typography,
} from "@mui/joy";
import { isNil, isNotNil } from "ramda";
import { Controller, type SubmitHandler, useForm } from "react-hook-form";
import { type CombinedError, useClient } from "urql";
import { EnumSelect } from "@/components/forms/EnumSelect";
import { convertYearToDate, formatVintage, parseNumber } from "@/utilities";

type SharedFields = {
  description?: string;
  alcohol_content_percentage?: string;
  barcode_code?: string;
  barcode_type?: string;
  style?: string;
  country?: Country_Enum;
};

type ISpiritFormInput = {
  type: Spirit_Type_Enum;
  name: string;
  vintage?: number;
} & SharedFields;

export type SpiritFormDefaultValues = {
  name?: string;
  vintage?: string;
  type?: Spirit_Type_Enum;
} & SharedFields;

type SpiritFormProps = {
  id?: string;
  itemOnboardingId?: string;
  defaultValues?: SpiritFormDefaultValues;
  onCreated: (createdId: string) => void;
};

function mapFormValuesToInsertInput(
  values: ISpiritFormInput,
  itemOnboardingId?: string,
): Spirits_Insert_Input {
  const update = {
    name: values.name,
    alcohol_content_percentage: parseNumber(values.alcohol_content_percentage),
    description: values.description,
    country: values.country,
    style: values.style,
    type: values.type,
    vintage: convertYearToDate(values.vintage),
    item_onboarding_id: itemOnboardingId,
  } as Spirits_Insert_Input;

  if (isNotNil(update) && isNotNil(values.barcode_code)) {
    update.barcode = {
      data: {
        code: values.barcode_code,
        type: values.barcode_type,
      },
      on_conflict: {
        constraint: Barcodes_Constraint.BarcodesPkey,
        update_columns: [Barcodes_Update_Column.Code],
      },
    };
  }
  return update;
}

export const SpiritForm = ({
  id,
  defaultValues,
  itemOnboardingId,
  onCreated,
}: SpiritFormProps) => {
  const client = useClient();
  const defaultVintage = formatVintage(defaultValues?.vintage);

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
  } = useForm<ISpiritFormInput>({
    defaultValues: {
      ...defaultValues,
      vintage:
        defaultVintage !== undefined ? parseInt(defaultVintage, 10) : undefined,
    },
  });

  const onSubmit: SubmitHandler<ISpiritFormInput> = async (values) => {
    let errored: CombinedError | undefined;
    let createdId: string | undefined;
    const update = mapFormValuesToInsertInput(values, itemOnboardingId);

    if (id === undefined) {
      const result = await client.mutation(addSpiritMutation, {
        spirit: update,
      });
      errored = result.error;
      createdId = result.data?.insert_spirits_one?.id;
    } else {
      const result = await client.mutation(updateSpiritMutation, {
        spiritId: id,
        spirit: update,
      });
      errored = result.error;
      createdId = result.data?.update_spirits_by_pk?.id;
    }
    if (isNil(errored) && isNotNil(createdId)) {
      onCreated(createdId);
    } else {
      setError("root", {
        type: "custom",
        message: "Something went wrong please try again...",
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
            <FormControl required>
              <FormLabel>Name</FormLabel>
              <Controller
                name="name"
                control={control}
                rules={{ required: true }}
                render={({ field }) => (
                  <Input disabled={isSubmitting} type="text" {...field} />
                )}
              />
            </FormControl>
            <EnumSelect
              name="type"
              control={control}
              enumKey="spiritType"
              label="Type"
              required
              rules={{ required: true }}
            />
            <FormControl>
              <FormLabel>Description</FormLabel>
              <Controller
                name="description"
                control={control}
                render={({ field }) => (
                  <Textarea disabled={isSubmitting} minRows={2} {...field} />
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Vintage</FormLabel>
              <Controller
                name="vintage"
                control={control}
                render={({ field }) => (
                  <Input
                    type="number"
                    disabled={isSubmitting}
                    slotProps={{
                      input: {
                        min: "1900",
                        max: "2099",
                        step: "1",
                      },
                    }}
                    {...field}
                  />
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Style</FormLabel>
              <Controller
                name="style"
                control={control}
                render={({ field }) => (
                  <Input disabled={isSubmitting} type="text" {...field} />
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Alcohol Content</FormLabel>
              <Controller
                name="alcohol_content_percentage"
                control={control}
                render={({ field }) => (
                  <Input disabled={isSubmitting} type="number" {...field} />
                )}
              />
            </FormControl>
            <EnumSelect
              name="country"
              control={control}
              enumKey="country"
              label="Country"
            />
            <FormControl>
              <FormLabel>Barcode</FormLabel>
              <Controller
                name="barcode_code"
                control={control}
                render={({ field }) => (
                  <Input disabled={isSubmitting} type="number" {...field} />
                )}
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
