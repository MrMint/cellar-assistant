"use client";

import { graphql } from "@/gql";
import { Spirit_Type_Enum } from "@/gql/graphql";
import { getEnumKeys, getEnums } from "@/utilities";
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
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { useMutation } from "urql";

const typeOptions = getEnumKeys(Spirit_Type_Enum);

interface IFormInput {
  name: string;
  description: string | undefined;
  price: number | undefined;
  alcohol_content_percentage: number | undefined;
  ean_13: number | undefined;
  upc_12: number | undefined;
  type: Spirit_Type_Enum;
  style: string | undefined;
  vintage: number | undefined;
}

const addSpiritMutation = graphql(`
  mutation addSpirit($spirit: spirits_insert_input!) {
    insert_spirits_one(object: $spirit) {
      id
    }
  }
`);

const AddSpirit = ({
  params: { cellarId },
}: {
  params: { cellarId: string };
}) => {
  const router = useRouter();
  const [{ fetching, error }, addSpirit] = useMutation(addSpiritMutation);

  const { control, handleSubmit } = useForm<IFormInput>();

  const onSubmit: SubmitHandler<IFormInput> = async ({
    name,
    price,
    alcohol_content_percentage,
    ean_13,
    upc_12,
    type,
    description,
    style,
    vintage,
  }) => {
    addSpirit({
      spirit: {
        cellar_id: cellarId,
        name,
        price,
        alcohol_content_percentage,
        ean_13,
        style,
        description,
        type,
        upc_12,
        vintage:
          vintage === undefined
            ? undefined
            : format(new Date(vintage, 0, 1), "yyyy-MM-dd"),
      },
    }).then((result) => {
      if (result.error === undefined) {
        router.push(`/cellars/${cellarId}/items`);
      }
    });
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

export default AddSpirit;
