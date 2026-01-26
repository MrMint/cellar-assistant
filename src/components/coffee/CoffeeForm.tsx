"use client";

import {
  Barcodes_Constraint,
  Barcodes_Update_Column,
  type Coffee_Cultivar_Enum,
  type Coffee_Process_Enum,
  type Coffee_Roast_Level_Enum,
  type Coffee_Species_Enum,
  type Country_Enum,
} from "@cellar-assistant/shared";
import {
  addCoffeeMutation,
  type Coffees_Insert_Input,
  updateCoffeeMutation,
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

type SharedFields = {
  description?: string;
  barcode_code?: string;
  barcode_type?: string;
  roast_level?: Coffee_Roast_Level_Enum;
  species?: Coffee_Species_Enum;
  process?: Coffee_Process_Enum;
  cultivar?: Coffee_Cultivar_Enum;
  country?: Country_Enum;
};

type ICoffeeFormInput = {
  name: string;
} & SharedFields;

export type CoffeeFormDefaultValues = {
  name?: string;
} & SharedFields;

export type CoffeeFormProps = {
  id?: string;
  itemOnboardingId?: string;
  defaultValues?: CoffeeFormDefaultValues;
  onCreated: (createdId: string) => void;
};

function mapFormValuesToInsertInput(
  values: ICoffeeFormInput,
  itemOnboardingId?: string,
): Coffees_Insert_Input {
  const update = {
    name: values.name,
    description: values.description,
    country: values.country,
    process: values.process,
    roast_level: values.roast_level,
    species: values.species,
    cultivar: values.cultivar,
    item_onboarding_id: itemOnboardingId,
  } as Coffees_Insert_Input;

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

export const CoffeeForm = ({
  id,
  defaultValues,
  itemOnboardingId,
  onCreated,
}: CoffeeFormProps) => {
  const client = useClient();

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
  } = useForm<ICoffeeFormInput>({
    defaultValues: {
      ...defaultValues,
    },
  });

  const onSubmit: SubmitHandler<ICoffeeFormInput> = async (values) => {
    let errored: CombinedError | undefined;
    let createdId: string | undefined;
    const update = mapFormValuesToInsertInput(values, itemOnboardingId);

    if (isNil(id)) {
      const result = await client.mutation(addCoffeeMutation, {
        coffee: update,
      });
      errored = result.error;
      createdId = result.data?.insert_coffees_one?.id;
    } else {
      const result = await client.mutation(updateCoffeeMutation, {
        coffeeId: id,
        coffee: update,
      });
      errored = result.error;
      createdId = result.data?.update_coffees_by_pk?.id;
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
              name="roast_level"
              control={control}
              enumKey="coffeeRoastLevel"
              label="Roast Level"
            />
            <EnumSelect
              name="species"
              control={control}
              enumKey="coffeeSpecies"
              label="Species"
            />
            <EnumSelect
              name="cultivar"
              control={control}
              enumKey="coffeeCultivar"
              label="Cultivar"
            />
            <EnumSelect
              name="process"
              control={control}
              enumKey="coffeeProcess"
              label="Process"
            />
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
                  <Input disabled={isSubmitting} type="text" {...field} />
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
