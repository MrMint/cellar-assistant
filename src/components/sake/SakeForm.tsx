"use client";

import {
  Barcodes_Constraint,
  Barcodes_Update_Column,
  type Country_Enum,
  type Sake_Category_Enum,
  type Sake_Rice_Variety_Enum,
  type Sake_Serving_Temperature_Enum,
  type Sake_Type_Enum,
} from "@cellar-assistant/shared";
import {
  addSakeMutation,
  type Sakes_Insert_Input,
  updateSakeMutation,
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
  region?: string;
  yeast_strain?: string;
  alcohol_content_percentage?: string;
  barcode_code?: string;
  barcode_type?: string;
  country?: Country_Enum;
  category?: Sake_Category_Enum;
  type?: Sake_Type_Enum;
  serving_temperature?: Sake_Serving_Temperature_Enum;
  rice_variety?: Sake_Rice_Variety_Enum;
  brand_id?: string;
  brand_name?: string;
  is_new_brand?: boolean;
};

type ISakeFormInput = {
  name: string;
  vintage: number;
  polish_grade?: string;
  sake_meter_value?: string;
  acidity?: string;
  amino_acid?: string;
} & SharedFields;

export type SakeFormDefaultValues = {
  name?: string;
  vintage?: string;
} & SharedFields;

type SakeFormProps = {
  id?: string;
  itemOnboardingId?: string;
  defaultValues?: SakeFormDefaultValues;
  onCreated: (createdId: string) => void;
};

function mapFormValuesToInsertInput(
  values: ISakeFormInput,
  itemOnboardingId?: string,
): Sakes_Insert_Input {
  const update = {
    name: values.name,
    alcohol_content_percentage: parseNumber(values.alcohol_content_percentage),
    description: values.description,
    region: values.region,
    country: values.country,
    category: values.category,
    type: values.type,
    serving_temperature: values.serving_temperature,
    rice_variety: values.rice_variety,
    yeast_strain: values.yeast_strain,
    polish_grade: parseNumber(values.polish_grade),
    sake_meter_value: parseNumber(values.sake_meter_value),
    acidity: parseNumber(values.acidity),
    amino_acid: parseNumber(values.amino_acid),
    vintage: convertYearToDate(values.vintage),
    item_onboarding_id: itemOnboardingId,
  } as Sakes_Insert_Input;

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

export const SakeForm = ({
  id,
  defaultValues,
  itemOnboardingId,
  onCreated,
}: SakeFormProps) => {
  const client = useClient();
  const defaultVintage = formatVintage(defaultValues?.vintage);

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
  } = useForm<ISakeFormInput>({
    defaultValues: {
      ...defaultValues,
      vintage:
        defaultVintage !== undefined ? parseInt(defaultVintage, 10) : undefined,
    },
  });

  const onSubmit: SubmitHandler<ISakeFormInput> = async (values) => {
    let errored: CombinedError | undefined;
    let createdId: string | undefined;
    const update = mapFormValuesToInsertInput(values, itemOnboardingId);

    if (id === undefined) {
      const result = await client.mutation(addSakeMutation, {
        sake: update,
      });
      errored = result.error;
      createdId = result.data?.insert_sakes_one?.id;
    } else {
      const result = await client.mutation(updateSakeMutation, {
        sakeId: id,
        sake: update,
      });
      errored = result.error;
      createdId = result.data?.update_sakes_by_pk?.id;
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
            <FormControl required>
              <FormLabel>Vintage</FormLabel>
              <Controller
                name="vintage"
                control={control}
                rules={{ required: true }}
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
              <FormLabel>Description</FormLabel>
              <Controller
                name="description"
                control={control}
                render={({ field }) => (
                  <Textarea disabled={isSubmitting} minRows={2} {...field} />
                )}
              />
            </FormControl>

            <EnumSelect
              name="category"
              control={control}
              enumKey="sakeCategory"
              label="Category"
              required
              rules={{ required: true }}
            />
            <EnumSelect
              name="type"
              control={control}
              enumKey="sakeType"
              label="Type"
            />
            <EnumSelect
              name="country"
              control={control}
              enumKey="country"
              label="Country"
            />
            <FormControl>
              <FormLabel>Region</FormLabel>
              <Controller
                name="region"
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
            <FormControl>
              <FormLabel>Polish Grade (%)</FormLabel>
              <Controller
                name="polish_grade"
                control={control}
                render={({ field }) => (
                  <Input disabled={isSubmitting} type="number" {...field} />
                )}
              />
            </FormControl>

            <FormControl>
              <FormLabel>SMV (Nihonshudo)</FormLabel>
              <Controller
                name="sake_meter_value"
                control={control}
                render={({ field }) => (
                  <Input disabled={isSubmitting} type="number" {...field} />
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Acidity</FormLabel>
              <Controller
                name="acidity"
                control={control}
                render={({ field }) => (
                  <Input disabled={isSubmitting} type="number" {...field} />
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Amino Acid</FormLabel>
              <Controller
                name="amino_acid"
                control={control}
                render={({ field }) => (
                  <Input disabled={isSubmitting} type="number" {...field} />
                )}
              />
            </FormControl>

            <EnumSelect
              name="rice_variety"
              control={control}
              enumKey="sakeRiceVariety"
              label="Rice Variety"
            />
            <FormControl>
              <FormLabel>Yeast Strain</FormLabel>
              <Controller
                name="yeast_strain"
                control={control}
                render={({ field }) => (
                  <Input disabled={isSubmitting} type="text" {...field} />
                )}
              />
            </FormControl>

            <EnumSelect
              name="serving_temperature"
              control={control}
              enumKey="sakeServingTemperature"
              label="Recommended Serving Temperature"
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
