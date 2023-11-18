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
import {
  Barcodes_Constraint,
  Barcodes_Update_Column,
  Country_Enum,
  Spirit_Type_Enum,
  Spirits_Insert_Input,
} from "@shared/gql/graphql";
import { addSpiritMutation, updateSpiritMutation } from "@shared/queries";
import { formatCountry, formatSpiritType } from "@shared/utility";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { isNil, isNotNil } from "ramda";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { CombinedError, useClient } from "urql";
import { countryKeys } from "@/constants";
import { formatVintage, getEnumKeys, parseNumber } from "@/utilities";

const typeOptions = getEnumKeys(Spirit_Type_Enum);

type SharedFields = {
  description?: string;
  alcohol_content_percentage?: string;
  barcode_code?: string;
  barcode_type?: string;
  style?: string;
  country?: Country_Enum;
};

type ISpiritFormInput = {
  type: Spirit_Type_Enum;
  name: string;
  vintage?: number;
} & SharedFields;

export type SpiritFormDefaultValues = {
  name?: string;
  vintage?: string;
  type?: Spirit_Type_Enum;
} & SharedFields;

type SpiritFormProps = {
  id?: string;
  itemOnboardingId?: string;
  defaultValues?: SpiritFormDefaultValues;
  onCreated: (createdId: string) => void;
};

function mapFormValuesToInsertInput(
  values: ISpiritFormInput,
  itemOnboardingId?: string,
): Spirits_Insert_Input {
  const update = {
    name: values.name,
    alcohol_content_percentage: parseNumber(values.alcohol_content_percentage),
    description: values.description,
    country: values.country,
    style: values.style,
    type: values.type,
    vintage: isNotNil(values.vintage)
      ? format(new Date(values.vintage, 0, 1), "yyyy-MM-dd")
      : undefined,
    item_onboarding_id: itemOnboardingId,
  } as Spirits_Insert_Input;

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

export const SpiritForm = ({
  id,
  defaultValues,
  itemOnboardingId,
  onCreated,
}: SpiritFormProps) => {
  const client = useClient();
  const defaultVintage = formatVintage(defaultValues?.vintage);

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
  } = useForm<ISpiritFormInput>({
    defaultValues: {
      ...defaultValues,
      vintage:
        defaultVintage !== undefined ? parseInt(defaultVintage) : undefined,
    },
  });

  const onSubmit: SubmitHandler<ISpiritFormInput> = async (values) => {
    let errored: CombinedError | undefined;
    let createdId: string | undefined;
    const update = mapFormValuesToInsertInput(values, itemOnboardingId);

    if (id == undefined) {
      const result = await client.mutation(addSpiritMutation, {
        spirit: update,
      });
      errored = result.error;
      createdId = result.data?.insert_spirits_one?.id;
    } else {
      const result = await client.mutation(updateSpiritMutation, {
        spiritId: id,
        spirit: update,
      });
      errored = result.error;
      createdId = result.data?.update_spirits_by_pk?.id;
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
              <FormLabel>Type</FormLabel>
              <Controller
                name="type"
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
                    {typeOptions.map((x) => (
                      <Option key={x} value={Spirit_Type_Enum[x]}>
                        {formatSpiritType(Spirit_Type_Enum[x])}
                      </Option>
                    ))}
                  </Select>
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
                        {formatCountry(Country_Enum[x])}
                      </Option>
                    ))}
                  </Select>
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
