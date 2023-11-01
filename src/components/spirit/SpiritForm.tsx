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
import { countryKeys } from "@/constants";
import { graphql } from "@/gql";
import {
  Barcodes_Constraint,
  Barcodes_Update_Column,
  Cellar_Spirit_Insert_Input,
  Country_Enum,
  Spirit_Type_Enum,
} from "@/gql/graphql";
import { formatVintage, getEnumKeys } from "@/utilities";

const typeOptions = getEnumKeys(Spirit_Type_Enum);

type SharedFields = {
  description?: string;
  alcohol_content_percentage?: number;
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
  cellarId: string;
  defaultValues?: SpiritFormDefaultValues;
  onCreated: (createdId: string) => void;
};

const addSpiritMutation = graphql(`
  mutation addSpirit($spirit: cellar_spirit_insert_input!) {
    insert_cellar_spirit_one(object: $spirit) {
      id
    }
  }
`);

const updateSpiritMutation = graphql(`
  mutation updateSpirit($spiritId: uuid!, $spirit: spirits_set_input!) {
    update_spirits_by_pk(pk_columns: { id: $spiritId }, _set: $spirit) {
      id
    }
  }
`);
function mapFormValuesToInsertInput(
  values: ISpiritFormInput,
  cellar_id: string,
  spirit_id?: string,
  itemOnboardingId?: string,
): Cellar_Spirit_Insert_Input {
  if (isNotNil(spirit_id)) {
    return {
      cellar_id,
      spirit_id,
    };
  }

  const update = {
    cellar_id,
    spirit: {
      data: {
        name: values.name,
        alcohol_content_percentage: values.alcohol_content_percentage,
        description: values.description,
        country: values.country,
        style: values.style,
        type: values.type,
        vintage: isNotNil(values.vintage)
          ? format(new Date(values.vintage, 0, 1), "yyyy-MM-dd")
          : undefined,
        item_onboarding_id: itemOnboardingId,
      },
    },
  } as Cellar_Spirit_Insert_Input;

  if (isNotNil(update.spirit) && isNotNil(values.barcode_code)) {
    update.spirit.data.barcode = {
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
  cellarId,
  defaultValues,
  itemOnboardingId,
  onCreated,
}: SpiritFormProps) => {
  const [
    { fetching: fetchingAdd, error: errorAdd, operation: opAdd },
    addSpirit,
  ] = useMutation(addSpiritMutation);
  const [
    { fetching: featchingUpdate, error: errorUpdate, operation: opUpdate },
    updateSpirit,
  ] = useMutation(updateSpiritMutation);

  const error = errorAdd || errorUpdate;
  const fetching =
    fetchingAdd ||
    featchingUpdate ||
    (error === undefined && (opAdd !== undefined || opUpdate !== undefined));

  const defaultVintage = formatVintage(defaultValues?.vintage);

  const { control, handleSubmit, clearErrors } = useForm<ISpiritFormInput>({
    defaultValues: {
      ...defaultValues,
      vintage:
        defaultVintage !== undefined ? parseInt(defaultVintage) : undefined,
    },
  });

  const onSubmit: SubmitHandler<ISpiritFormInput> = async (values) => {
    let errored: CombinedError | undefined;
    let createdId: string | undefined;
    const update = mapFormValuesToInsertInput(
      values,
      cellarId,
      id,
      itemOnboardingId,
    );
    if (id == undefined) {
      const result = await addSpirit({
        spirit: update,
      });
      errored = result.error;
      createdId = result.data?.insert_cellar_spirit_one?.id;
    } else {
      const result = await updateSpirit({
        spiritId: id,
        spirit: update,
      });
      errored = result.error;
      createdId = result.data?.update_spirits_by_pk?.id;
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
                        {x}
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
