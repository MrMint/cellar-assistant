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
import { isNotNil } from "ramda";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { CombinedError, useMutation } from "urql";
import { graphql } from "@/gql";
import {
  Barcodes_Constraint,
  Wine_Variety_Enum,
  Barcodes_Update_Column,
  Cellar_Wine_Insert_Input,
  Country_Enum,
  Wine_Style_Enum,
} from "@/gql/graphql";
import { formatVintage, getEnumKeys } from "@/utilities";

// TODO move these over to graphql queries to support enum tables edits at runtime
const styleOptions = getEnumKeys(Wine_Style_Enum);
const varietyOptions = getEnumKeys(Wine_Variety_Enum);
const countryOptions = getEnumKeys(Country_Enum);

type SharedFields = {
  description?: string;
  region?: string;
  special_designation?: string;
  vineyard_designation?: string;
  alcohol_content_percentage?: number;
  barcode_code?: string;
  barcode_type?: string;
  country?: Country_Enum;
};

type IWineFormInput = {
  name: string;
  vintage: number;
  variety: Wine_Variety_Enum;
  style: Wine_Style_Enum;
} & SharedFields;

export type WineFormDefaultValues = {
  name?: string;
  vintage?: string;
  variety?: Wine_Variety_Enum;
  style?: Wine_Style_Enum;
} & SharedFields;

type WineFormProps = {
  id?: string;
  cellarId: string;
  itemOnboardingId?: string;
  returnUrl: string;
  defaultValues?: WineFormDefaultValues;
};

const addWineMutation = graphql(`
  mutation addWine($wine: cellar_wine_insert_input!) {
    insert_cellar_wine_one(object: $wine) {
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

function mapFormValuesToInsertInput(
  values: IWineFormInput,
  cellar_id: string,
  wine_id?: string,
  itemOnboardingId?: string,
): Cellar_Wine_Insert_Input {
  if (isNotNil(wine_id)) {
    return {
      cellar_id,
      wine_id,
    };
  }

  const update = {
    cellar_id,
    wine: {
      data: {
        name: values.name,
        alcohol_content_percentage: values.alcohol_content_percentage,
        description: values.description,
        region: values.region,
        country: values.country,
        special_designation: values.special_designation,
        vineyard_designation: values.vineyard_designation,
        variety: values.variety,
        style: values.style,
        vintage: format(new Date(values.vintage, 0, 1), "yyyy-MM-dd"),
        item_onboarding_id: itemOnboardingId,
      },
    },
  } as Cellar_Wine_Insert_Input;

  if (isNotNil(update.wine) && isNotNil(values.barcode_code)) {
    update.wine.data.barcode = {
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

export const WineForm = ({
  id,
  cellarId,
  returnUrl,
  defaultValues,
  itemOnboardingId,
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

  const defaultVintage = formatVintage(defaultValues?.vintage);

  const { control, handleSubmit, clearErrors } = useForm<IWineFormInput>({
    defaultValues: {
      ...defaultValues,
      vintage:
        defaultVintage !== undefined ? parseInt(defaultVintage) : undefined,
    },
  });

  const onSubmit: SubmitHandler<IWineFormInput> = async (values) => {
    let errored: CombinedError | undefined;
    const update = mapFormValuesToInsertInput(
      values,
      cellarId,
      id,
      itemOnboardingId,
    );

    if (id == undefined) {
      errored = (
        await addWine({
          wine: update,
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
            <FormControl required>
              <FormLabel>Style</FormLabel>
              <Controller
                name="style"
                control={control}
                rules={{ required: true }}
                render={({ field }) => (
                  <Select
                    placeholder="Choose one…"
                    {...field}
                    onChange={(_, value) => {
                      field.onChange(value);
                    }}
                  >
                    {styleOptions.map((x) => (
                      <Option key={x} value={Wine_Style_Enum[x]}>
                        {x}
                      </Option>
                    ))}
                  </Select>
                )}
              />
            </FormControl>
            <FormControl required>
              <FormLabel>Variety</FormLabel>
              <Controller
                name="variety"
                control={control}
                rules={{ required: true }}
                render={({ field }) => (
                  <Select
                    placeholder="Choose one…"
                    {...field}
                    onChange={(_, value) => {
                      field.onChange(value);
                    }}
                  >
                    {varietyOptions.map((x) => (
                      <Option key={x} value={Wine_Variety_Enum[x]}>
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
                rules={{ required: true }}
                render={({ field }) => (
                  <Select
                    placeholder="Choose one…"
                    {...field}
                    onChange={(_, value) => {
                      field.onChange(value);
                    }}
                  >
                    {countryOptions.map((x) => (
                      <Option key={x} value={Country_Enum[x]}>
                        {x}
                      </Option>
                    ))}
                  </Select>
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
              <FormLabel>Barcode</FormLabel>
              <Controller
                name="barcode_code"
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
