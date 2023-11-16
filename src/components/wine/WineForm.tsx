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
  Wine_Variety_Enum,
  Barcodes_Update_Column,
  Cellar_Wine_Insert_Input,
  Country_Enum,
  Wine_Style_Enum,
  Wines_Insert_Input,
} from "@shared/gql/graphql";
import { addWineMutation, updateWineMutation } from "@shared/queries";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { isNil, isNotNil } from "ramda";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { CombinedError, useClient, useMutation } from "urql";
import { countryKeys, wineStyleKeys, wineVarietyKeys } from "@/constants";
import { formatVintage } from "@/utilities";

type SharedFields = {
  description?: string;
  region?: string;
  special_designation?: string;
  vineyard_designation?: string;
  alcohol_content_percentage?: number;
  barcode_code?: string;
  barcode_type?: string;
  country?: Country_Enum;
  variety?: Wine_Variety_Enum;
};

type IWineFormInput = {
  name: string;
  vintage: number;
  style: Wine_Style_Enum;
} & SharedFields;

export type WineFormDefaultValues = {
  name?: string;
  vintage?: string;
  style?: Wine_Style_Enum;
} & SharedFields;

type WineFormProps = {
  id?: string;
  itemOnboardingId?: string;
  defaultValues?: WineFormDefaultValues;
  onCreated: (createdId: string) => void;
};

function mapFormValuesToInsertInput(
  values: IWineFormInput,
  itemOnboardingId?: string,
): Wines_Insert_Input {
  const update = {
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
  } as Wines_Insert_Input;

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

export const WineForm = ({
  id,
  defaultValues,
  itemOnboardingId,
  onCreated,
}: WineFormProps) => {
  const client = useClient();
  const defaultVintage = formatVintage(defaultValues?.vintage);

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
  } = useForm<IWineFormInput>({
    defaultValues: {
      ...defaultValues,
      vintage:
        defaultVintage !== undefined ? parseInt(defaultVintage) : undefined,
    },
  });

  const onSubmit: SubmitHandler<IWineFormInput> = async (values) => {
    let errored: CombinedError | undefined;
    let createdId: string | undefined;
    const update = mapFormValuesToInsertInput(values, itemOnboardingId);

    if (id == undefined) {
      const result = await client.mutation(addWineMutation, {
        wine: update,
      });
      errored = result.error;
      createdId = result.data?.insert_wines_one?.id;
    } else {
      const result = await client.mutation(updateWineMutation, {
        wineId: id,
        wine: update,
      });
      errored = result.error;
      createdId = result.data?.update_wines_by_pk?.id;
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
                    {wineStyleKeys.map((x) => (
                      <Option key={x} value={Wine_Style_Enum[x]}>
                        {x}
                      </Option>
                    ))}
                  </Select>
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Variety</FormLabel>
              <Controller
                name="variety"
                control={control}
                render={({ field }) => (
                  <Select
                    placeholder="Choose one…"
                    {...field}
                    onChange={(_, value) => {
                      field.onChange(value);
                    }}
                  >
                    {wineVarietyKeys.map((x) => (
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
              <FormLabel>Vineyard Designation</FormLabel>
              <Controller
                name="vineyard_designation"
                control={control}
                render={({ field }) => (
                  <Input disabled={isSubmitting} type="text" {...field} />
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Special Designation</FormLabel>
              <Controller
                name="special_designation"
                control={control}
                render={({ field }) => (
                  <Input disabled={isSubmitting} type="text" {...field} />
                )}
              />
            </FormControl>
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
