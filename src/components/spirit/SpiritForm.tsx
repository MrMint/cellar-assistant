import { graphql } from "@/gql";
import { Spirit_Type_Enum } from "@/gql/graphql";
import { formatIsoDateString, getEnumKeys } from "@/utilities";
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
import { isNil } from "ramda";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { CombinedError, useMutation } from "urql";

const typeOptions = getEnumKeys(Spirit_Type_Enum);

type SharedFields = {
  description?: string;
  price?: number;
  alcohol_content_percentage?: number;
  ean_13?: number;
  upc_12?: number;
  international_bitterness_unit?: number;
  style?: string;
};

type ISpiritFormInput = {
  type: Spirit_Type_Enum;
  name: string;
  vintage?: number;
} & SharedFields;

type DefaultValues = {
  name?: string;
  vintage?: string;
  type?: Spirit_Type_Enum;
} & SharedFields;

type SpiritFormProps = {
  id?: string;
  cellarId: string;
  returnUrl: string;
  defaultValues?: DefaultValues;
};

const addSpiritMutation = graphql(`
  mutation addSpirit($spirit: spirits_insert_input!) {
    insert_spirits_one(object: $spirit) {
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

const SpiritForm = ({
  id,
  cellarId,
  returnUrl,
  defaultValues,
}: SpiritFormProps) => {
  const router = useRouter();
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

  const defaultVintage = formatIsoDateString(defaultValues?.vintage, "yyyy");

  const { control, handleSubmit, clearErrors } = useForm<ISpiritFormInput>({
    defaultValues: {
      ...defaultValues,
      vintage:
        defaultVintage !== undefined ? parseInt(defaultVintage) : undefined,
    },
  });

  const onSubmit: SubmitHandler<ISpiritFormInput> = async (values) => {
    const update = {
      ...values,
      vintage: isNil(values.vintage)
        ? undefined
        : format(new Date(values.vintage, 0, 1), "yyyy-MM-dd"),
    };

    let errored: CombinedError | undefined;

    if (id == undefined) {
      errored = (
        await addSpirit({
          spirit: { ...update, cellar_id: cellarId },
        })
      ).error;
    } else {
      errored = (
        await updateSpirit({
          spiritId: id,
          spirit: update,
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
              <FormLabel>EAN</FormLabel>
              <Controller
                name="ean_13"
                control={control}
                render={({ field }) => (
                  <Input disabled={fetching} type="number" {...field} />
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>UPC</FormLabel>
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

export default SpiritForm;
