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
import { BeerStyle, Country, VariablesOf } from "@shared/gql";
import { addBeerMutation, updateBeerMutation } from "@shared/queries";
import { formatBeerStyle, formatCountry } from "@shared/utility";
import { isNil, isNotNil } from "ramda";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { CombinedError, useClient } from "urql";
import { convertYearToDate, formatVintage, parseNumber } from "@/utilities";

type SharedFields = {
  description?: string;
  barcode_code?: string;
  barcode_type?: string;
  style?: BeerStyle;
  country?: Country;
  alcohol_content_percentage?: string;
  international_bitterness_unit?: string;
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
  countries: Country[];
  styles: BeerStyle[];
  onCreated: (createdId: string) => void;
};

function mapFormValuesToInsertInput(
  values: IBeerFormInput,
  itemOnboardingId?: string,
): VariablesOf<typeof addBeerMutation>["beer"] {
  const update = {
    name: values.name,
    alcohol_content_percentage: parseNumber(values.alcohol_content_percentage),
    description: values.description,
    country: values.country,
    style: values.style,
    vintage: convertYearToDate(values.vintage),
    item_onboarding_id: itemOnboardingId,
    international_bitterness_unit: parseNumber(
      values.international_bitterness_unit,
    ),
  } as VariablesOf<typeof addBeerMutation>["beer"];

  if (isNotNil(update) && isNotNil(values.barcode_code)) {
    update.barcode = {
      data: {
        code: values.barcode_code,
        type: values.barcode_type,
      },
      on_conflict: {
        constraint: "barcodes_pkey",
        update_columns: ["code"],
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
  styles,
  countries,
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
                    {styles.map((x) => (
                      <Option key={x} value={x}>
                        {formatBeerStyle(x)}
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
                    {countries.map((x) => (
                      <Option key={x} value={x}>
                        {formatCountry(x)}
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
