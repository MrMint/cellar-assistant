import { graphql } from "@/gql";
import { formatIsoDateString, nullsToUndefined } from "@/utilities";
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
  variety?: string;
  region?: string;
  special_designation?: string;
  vineyard_designation?: string;
  alcohol_content_percentage?: number;
  ean_13?: number;
  upc_12?: number;
};

type IWineFormInput = {
  name: string;
  vintage?: number;
} & SharedFields;

type DefaultValues = {
  name?: string;
  vintage?: string;
} & SharedFields;

type WineFormProps = {
  id?: string;
  cellarId: string;
  returnUrl: string;
  defaultValues?: DefaultValues;
};

const addWineMutation = graphql(`
  mutation addWine($wine: wines_insert_input!) {
    insert_wines_one(object: $wine) {
      id
    }
  }
`);

const updateWineMutation = graphql(`
  mutation updateWine($wineId: uuid!, $wine: wines_set_input!) {
    update_wines_by_pk(pk_columns: { id: $wineId }, _set: $wine) {
      id
    }
  }
`);

const WineForm = ({
  id,
  cellarId,
  returnUrl,
  defaultValues,
}: WineFormProps) => {
  const router = useRouter();
  const [
    { fetching: fetchingAdd, error: errorAdd, operation: opAdd },
    addWine,
  ] = useMutation(addWineMutation);
  const [
    { fetching: featchingUpdate, error: errorUpdate, operation: opUpdate },
    updateWine,
  ] = useMutation(updateWineMutation);

  const error = errorAdd || errorUpdate;
  const fetching =
    fetchingAdd ||
    featchingUpdate ||
    (error === undefined && (opAdd !== undefined || opUpdate !== undefined));

  const defaultVintage = formatIsoDateString(defaultValues?.vintage, "yyyy");

  const { control, handleSubmit, clearErrors } = useForm<IWineFormInput>({
    defaultValues: {
      ...defaultValues,
      vintage:
        defaultVintage !== undefined ? parseInt(defaultVintage) : undefined,
    },
  });

  const onSubmit: SubmitHandler<IWineFormInput> = async (values) => {
    const update = {
      ...values,
      vintage: isNil(values.vintage)
        ? undefined
        : format(new Date(values.vintage, 0, 1), "yyyy-MM-dd"),
    };

    let errored: CombinedError | undefined;

    if (id == undefined) {
      errored = (
        await addWine({
          wine: { ...update, cellar_id: cellarId },
        })
      ).error;
    } else {
      errored = (
        await updateWine({
          wineId: id,
          wine: update,
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
        width: theme.breakpoints.values.sm,
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
            <FormControl required>
              <FormLabel>Vintage</FormLabel>
              <Controller
                name="vintage"
                control={control}
                rules={{ required: true }}
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
              <FormLabel>Variety</FormLabel>
              <Controller
                name="variety"
                control={control}
                render={({ field }) => (
                  <Input disabled={fetching} type="text" {...field} />
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Region</FormLabel>
              <Controller
                name="region"
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
              <FormLabel>Vineyard Designation</FormLabel>
              <Controller
                name="vineyard_designation"
                control={control}
                render={({ field }) => (
                  <Input disabled={fetching} type="text" {...field} />
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Special Designation</FormLabel>
              <Controller
                name="special_designation"
                control={control}
                render={({ field }) => (
                  <Input disabled={fetching} type="text" {...field} />
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>EAN13</FormLabel>
              <Controller
                name="ean_13"
                control={control}
                render={({ field }) => (
                  <Input disabled={fetching} type="number" {...field} />
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>UPC12</FormLabel>
              <Controller
                name="upc_12"
                control={control}
                render={({ field }) => (
                  <Input disabled={fetching} type="number" {...field} />
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

export default WineForm;