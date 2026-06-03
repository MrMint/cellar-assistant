"use client";

import {
  Barcodes_Constraint,
  Barcodes_Update_Column,
  type Country_Enum,
  type Tea_Caffeine_Level_Enum,
  type Tea_Category_Enum,
  type Tea_Form_Enum,
} from "@cellar-assistant/shared";
import {
  addTeaMutation,
  type Teas_Insert_Input,
  updateTeaMutation,
} from "@cellar-assistant/shared/queries";
import {
  Box,
  Button,
  Checkbox,
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
import { parseNumber } from "@/utilities";

type SharedFields = {
  description?: string;
  region?: string;
  country?: Country_Enum;
  category?: Tea_Category_Enum;
  form?: Tea_Form_Enum;
  caffeine_level?: Tea_Caffeine_Level_Enum;
  cultivar?: string;
  oxidation_level?: string;
  processing?: string;
  ingredients?: string;
  steeping_temperature?: string;
  steeping_time?: string;
  flavor_profile?: string;
  is_organic?: boolean;
  is_fair_trade?: boolean;
  barcode_code?: string;
  barcode_type?: string;
  brand_id?: string;
  brand_name?: string;
  is_new_brand?: boolean;
};

type ITeaFormInput = {
  name: string;
  harvest_year?: string;
} & SharedFields;

export type TeaFormDefaultValues = {
  name?: string;
  harvest_year?: string;
} & SharedFields;

type TeaFormProps = {
  id?: string;
  itemOnboardingId?: string;
  defaultValues?: TeaFormDefaultValues;
  onCreated: (createdId: string) => void;
};

function mapFormValuesToInsertInput(
  values: ITeaFormInput,
  itemOnboardingId?: string,
): Teas_Insert_Input {
  const update = {
    name: values.name,
    description: values.description,
    region: values.region,
    country: values.country,
    category: values.category,
    form: values.form,
    caffeine_level: values.caffeine_level,
    cultivar: values.cultivar,
    oxidation_level: values.oxidation_level,
    processing: values.processing,
    ingredients: values.ingredients,
    steeping_temperature: values.steeping_temperature,
    steeping_time: values.steeping_time,
    flavor_profile: values.flavor_profile,
    is_organic: values.is_organic,
    is_fair_trade: values.is_fair_trade,
    harvest_year: parseNumber(values.harvest_year),
    item_onboarding_id: itemOnboardingId,
  } as Teas_Insert_Input;

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

export const TeaForm = ({
  id,
  defaultValues,
  itemOnboardingId,
  onCreated,
}: TeaFormProps) => {
  const client = useClient();

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
  } = useForm<ITeaFormInput>({
    defaultValues,
  });

  const onSubmit: SubmitHandler<ITeaFormInput> = async (values) => {
    let errored: CombinedError | undefined;
    let createdId: string | undefined;
    const update = mapFormValuesToInsertInput(values, itemOnboardingId);

    if (id === undefined) {
      const result = await client.mutation(addTeaMutation, {
        tea: update,
      });
      errored = result.error;
      createdId = result.data?.insert_teas_one?.id;
    } else {
      const result = await client.mutation(updateTeaMutation, {
        teaId: id,
        tea: update,
      });
      errored = result.error;
      createdId = result.data?.update_teas_by_pk?.id;
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
            <FormControl>
              <FormLabel>Harvest Year</FormLabel>
              <Controller
                name="harvest_year"
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
              enumKey="teaCategory"
              label="Category"
              required
              rules={{ required: true }}
            />
            <EnumSelect
              name="form"
              control={control}
              enumKey="teaForm"
              label="Form"
            />
            <EnumSelect
              name="caffeine_level"
              control={control}
              enumKey="teaCaffeineLevel"
              label="Caffeine Level"
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
              <FormLabel>Cultivar</FormLabel>
              <Controller
                name="cultivar"
                control={control}
                render={({ field }) => (
                  <Input disabled={isSubmitting} type="text" {...field} />
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Oxidation Level</FormLabel>
              <Controller
                name="oxidation_level"
                control={control}
                render={({ field }) => (
                  <Input disabled={isSubmitting} type="text" {...field} />
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Processing</FormLabel>
              <Controller
                name="processing"
                control={control}
                render={({ field }) => (
                  <Input disabled={isSubmitting} type="text" {...field} />
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Ingredients</FormLabel>
              <Controller
                name="ingredients"
                control={control}
                render={({ field }) => (
                  <Textarea disabled={isSubmitting} minRows={2} {...field} />
                )}
              />
            </FormControl>

            <FormControl>
              <FormLabel>Steeping Temperature</FormLabel>
              <Controller
                name="steeping_temperature"
                control={control}
                render={({ field }) => (
                  <Input disabled={isSubmitting} type="text" {...field} />
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Steeping Time</FormLabel>
              <Controller
                name="steeping_time"
                control={control}
                render={({ field }) => (
                  <Input disabled={isSubmitting} type="text" {...field} />
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Flavor Profile</FormLabel>
              <Controller
                name="flavor_profile"
                control={control}
                render={({ field }) => (
                  <Textarea disabled={isSubmitting} minRows={2} {...field} />
                )}
              />
            </FormControl>

            <Controller
              name="is_organic"
              control={control}
              render={({ field: { value, onChange, ...field } }) => (
                <Checkbox
                  label="Organic"
                  disabled={isSubmitting}
                  checked={value ?? false}
                  onChange={(event) => onChange(event.target.checked)}
                  {...field}
                />
              )}
            />
            <Controller
              name="is_fair_trade"
              control={control}
              render={({ field: { value, onChange, ...field } }) => (
                <Checkbox
                  label="Fair Trade"
                  disabled={isSubmitting}
                  checked={value ?? false}
                  onChange={(event) => onChange(event.target.checked)}
                  {...field}
                />
              )}
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
