import { graphql } from "@/gql";
import {
  Barcodes_Constraint,
  Barcodes_Update_Column,
  Beers_Insert_Input,
} from "@/gql/graphql";
import { formatIsoDateString } from "@/utilities";
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
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { isNil } from "ramda";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { CombinedError, useMutation } from "urql";

type SharedFields = {
  description?: string;
  price?: number;
  alcohol_content_percentage?: number;
  barcode_code?: string;
  barcode_type?: string;
  international_bitterness_unit?: number;
  style?: string;
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
  returnUrl: string;
  itemOnboardingId?: string;
  defaultValues?: BeerFormDefaultValues;
};

const addBeerMutation = graphql(`
  mutation addBeer($beer: beers_insert_input!) {
    insert_beers_one(object: $beer) {
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
): Beers_Insert_Input {
  return {
    name: values.name,
    alcohol_content_percentage: values.alcohol_content_percentage,
    cellar_id,
    description: values.description,
    international_bitterness_unit: values.international_bitterness_unit,
    style: values.style,
    vintage: isNil(values.vintage)
      ? undefined
      : format(new Date(values.vintage, 0, 1), "yyyy-MM-dd"),
    barcode: {
      data: {
        code: values.barcode_code,
        type: values.barcode_type,
      },
      on_conflict: {
        constraint: Barcodes_Constraint.BarcodesPkey,
        update_columns: [Barcodes_Update_Column.Code],
      },
    },
  };
}

export const BeerForm = ({
  id,
  cellarId,
  returnUrl,
  defaultValues,
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

  const defaultVintage = formatIsoDateString(defaultValues?.vintage, "yyyy");

  const { control, handleSubmit, clearErrors } = useForm<IBeerFormInput>({
    defaultValues: {
      ...defaultValues,
      vintage:
        defaultVintage !== undefined ? parseInt(defaultVintage) : undefined,
    },
  });

  const onSubmit: SubmitHandler<IBeerFormInput> = async (values) => {
    let errored: CombinedError | undefined;
    const update = mapFormValuesToInsertInput(values, cellarId);

    if (id == undefined) {
      errored = (
        await addBeer({
          beer: update,
        })
      ).error;
    } else {
      errored = (
        await updateBeer({
          beerId: id,
          beer: update,
        })
      ).error;
    }

    if (errored === undefined) {
      router.push(returnUrl);
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
                  <Input disabled={fetching} type="text" {...field} />
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Price</FormLabel>
              <Controller
                name="price"
                control={control}
                render={({ field }) => (
                  <Input disabled={fetching} type="number" {...field} />
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
