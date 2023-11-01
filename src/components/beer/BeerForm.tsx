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
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { isNil, isNotNil } from "ramda";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { CombinedError, useMutation } from "urql";
import { beerStyleKeys, countryKeys } from "@/constants";
import { graphql } from "@/gql";
import {
  Barcodes_Constraint,
  Barcodes_Update_Column,
  Beer_Style_Enum,
  Cellar_Beer_Insert_Input,
  Country_Enum,
} from "@/gql/graphql";
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
  cellarId: string;
  itemOnboardingId?: string;
  defaultValues?: BeerFormDefaultValues;
  onCreated: (createdId: string) => void;
};

const addBeerMutation = graphql(`
  mutation addBeer($beer: cellar_beer_insert_input!) {
    insert_cellar_beer_one(object: $beer) {
      id
    }
  }
`);

const updateBeerMutation = graphql(`
  mutation updateBeer($beerId: uuid!, $beer: beers_set_input!) {
    update_beers_by_pk(pk_columns: { id: $beerId }, _set: $beer) {
      id
    }
  }
`);
function mapFormValuesToInsertInput(
  values: IBeerFormInput,
  cellar_id: string,
  beer_id?: string,
  itemOnboardingId?: string,
): Cellar_Beer_Insert_Input {
  if (isNotNil(beer_id)) {
    return {
      cellar_id,
      beer_id,
    };
  }

  const update = {
    cellar_id,
    beer: {
      data: {
        name: values.name,
        alcohol_content_percentage: values.alcohol_content_percentage,
        description: values.description,
        country: values.country,
        style: values.style,
        vintage: isNotNil(values.vintage)
          ? format(new Date(values.vintage, 0, 1), "yyyy-MM-dd")
          : undefined,
        item_onboarding_id: itemOnboardingId,
        international_bitterness_unit: values.international_bitterness_unit,
      },
    },
  } as Cellar_Beer_Insert_Input;

  if (isNotNil(update.beer) && isNotNil(values.barcode_code)) {
    update.beer.data.barcode = {
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
  cellarId,
  defaultValues,
  itemOnboardingId,
  onCreated,
}: BeerFormProps) => {
  const router = useRouter();
  const [
    { fetching: fetchingAdd, error: errorAdd, operation: opAdd },
    addBeer,
  ] = useMutation(addBeerMutation);
  const [
    { fetching: featchingUpdate, error: errorUpdate, operation: opUpdate },
    updateBeer,
  ] = useMutation(updateBeerMutation);

  const error = errorAdd || errorUpdate;
  const fetching =
    fetchingAdd ||
    featchingUpdate ||
    (error === undefined && (opAdd !== undefined || opUpdate !== undefined));

  const defaultVintage = formatVintage(defaultValues?.vintage);

  const { control, handleSubmit, clearErrors } = useForm<IBeerFormInput>({
    defaultValues: {
      ...defaultValues,
      vintage:
        defaultVintage !== undefined ? parseInt(defaultVintage) : undefined,
    },
  });

  const onSubmit: SubmitHandler<IBeerFormInput> = async (values) => {
    let errored: CombinedError | undefined;
    let createdId: string | undefined;
    const update = mapFormValuesToInsertInput(
      values,
      cellarId,
      id,
      itemOnboardingId,
    );

    if (id == undefined) {
      const result = await addBeer({
        beer: update,
      });
      errored = result.error;
      createdId = result.data?.insert_cellar_beer_one?.id;
    } else {
      const result = await updateBeer({
        beerId: id,
        beer: update,
      });
      errored = result.error;
      createdId = result.data?.update_beers_by_pk?.id;
    }
    if (isNil(errored) && isNotNil(createdId)) {
      onCreated(createdId);
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
                  <Input disabled={fetching} type="text" {...field} />
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Description</FormLabel>
              <Controller
                name="description"
                control={control}
                render={({ field }) => (
                  <Textarea disabled={fetching} minRows={2} {...field} />
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
                    disabled={fetching}
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
                  <Input disabled={fetching} type="number" {...field} />
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>IBU</FormLabel>
              <Controller
                name="international_bitterness_unit"
                control={control}
                render={({ field }) => (
                  <Input disabled={fetching} type="number" {...field} />
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Barcode</FormLabel>
              <Controller
                name="barcode_code"
                control={control}
                render={({ field }) => (
                  <Input disabled={fetching} type="text" {...field} />
                )}
              />
            </FormControl>
          </Stack>
          {error !== undefined && (
            <Typography>Woah error encountered</Typography>
          )}
          <Button loading={fetching} type="submit">
            Add
          </Button>
        </Stack>
      </form>
    </Box>
  );
};
