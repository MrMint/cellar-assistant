import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Option,
  Select,
  Stack,
  Textarea,
  Typography,
} from "@mui/joy";
import { graphql } from "@shared/gql";
import {
  Barcodes_Constraint,
  Barcodes_Update_Column,
  Beer_Style_Enum,
  Beers_Insert_Input,
  Country_Enum,
} from "@shared/gql/graphql";
import { addBeerMutation, updateBeerMutation } from "@shared/queries";
import { format } from "date-fns";
import { isNil, isNotNil } from "ramda";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { CombinedError, useClient } from "urql";
import { beerStyleKeys, countryKeys } from "@/constants";
import { formatVintage } from "@/utilities";

type SharedFields = {
  description?: string;
  alcohol_content_percentage?: number;
  barcode_code?: string;
  barcode_type?: string;
  international_bitterness_unit?: number;
  style?: Beer_Style_Enum;
  country?: Country_Enum;
};

type IBeerFormInput = {
  name: string;
  vintage?: number;
} & SharedFields;

export type BeerFormDefaultValues = {
  name?: string;
  vintage?: string;
} & SharedFields;

export type BeerFormProps = {
  id?: string;
  itemOnboardingId?: string;
  defaultValues?: BeerFormDefaultValues;
  onCreated: (createdId: string) => void;
};

function mapFormValuesToInsertInput(
  values: IBeerFormInput,
  itemOnboardingId?: string,
): Beers_Insert_Input {
  const update = {
    name: values.name,
    alcohol_content_percentage:
      values.alcohol_content_percentage !== ""
        ? values.alcohol_content_percentage
        : undefined,
    description: values.description,
    country: values.country,
    style: values.style,
    vintage: isNotNil(values.vintage)
      ? format(new Date(values.vintage, 0, 1), "yyyy-MM-dd")
      : undefined,
    item_onboarding_id: itemOnboardingId,
    international_bitterness_unit: values.international_bitterness_unit,
  } as Beers_Insert_Input;

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

export const BeerForm = ({
  id,
  defaultValues,
  itemOnboardingId,
  onCreated,
}: BeerFormProps) => {
  const client = useClient();
  const defaultVintage = formatVintage(defaultValues?.vintage);

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
  } = useForm<IBeerFormInput>({
    defaultValues: {
      ...defaultValues,
      vintage:
        defaultVintage !== undefined ? parseInt(defaultVintage) : undefined,
    },
  });

  const onSubmit: SubmitHandler<IBeerFormInput> = async (values) => {
    let errored: CombinedError | undefined;
    let createdId: string | undefined;
    const update = mapFormValuesToInsertInput(values, itemOnboardingId);

    if (isNil(id)) {
      const result = await client.mutation(addBeerMutation, {
        beer: update,
      });
      errored = result.error;
      createdId = result.data?.insert_beers_one?.id;
    } else {
      const result = await client.mutation(updateBeerMutation, {
        beerId: id,
        beer: update,
      });
      errored = result.error;
      createdId = result.data?.update_beers_by_pk?.id;
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
                rules={{ required: true, va }}
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
                  <Select
                    placeholder="Choose one…"
                    {...field}
                    onChange={(_, value) => {
                      field.onChange(value);
                    }}
                  >
                    {beerStyleKeys.map((x) => (
                      <Option key={x} value={Beer_Style_Enum[x]}>
                        {x}
                      </Option>
                    ))}
                  </Select>
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Country</FormLabel>
              <Controller
                name="country"
                control={control}
                render={({ field }) => (
                  <Select
                    placeholder="Choose one…"
                    {...field}
                    onChange={(_, value) => {
                      field.onChange(value);
                    }}
                  >
                    {countryKeys.map((x) => (
                      <Option key={x} value={Country_Enum[x]}>
                        {x}
                      </Option>
                    ))}
                  </Select>
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
              <FormLabel>IBU</FormLabel>
              <Controller
                name="international_bitterness_unit"
                control={control}
                render={({ field }) => (
                  <Input disabled={isSubmitting} type="number" {...field} />
                )}
              />
            </FormControl>
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
