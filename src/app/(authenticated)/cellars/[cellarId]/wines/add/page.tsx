"use client";

import { graphql } from "@/gql";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Stack,
  Typography,
} from "@mui/joy";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { useMutation } from "urql";

interface IFormInput {
  name: string;
  vintage: number | undefined;
  variety: string | undefined;
  region: string | undefined;
  price: number | undefined;
  alcoholContent: number | undefined;
  ean13: number | undefined;
}

const addWineMutation = graphql(`
  mutation addWine($wine: wines_insert_input!) {
    insert_wines_one(object: $wine) {
      id
    }
  }
`);

const AddWine = ({
  params: { cellarId },
}: {
  params: { cellarId: string };
}) => {
  const router = useRouter();
  const [{ fetching, error }, addWine] = useMutation(addWineMutation);

  const { control, handleSubmit, clearErrors } = useForm<IFormInput>({
    defaultValues: {
      vintage: 2023,
    },
  });

  const onSubmit: SubmitHandler<IFormInput> = async ({
    name,
    vintage,
    variety,
    region,
    price,
    alcoholContent,
    ean13,
  }) => {
    addWine({
      wine: {
        cellar_id: cellarId,
        name,
        vintage:
          vintage === undefined
            ? undefined
            : format(new Date(vintage, 0, 1), "yyyy-MM-dd"),
        variety,
        region,
        price,
        alcohol_content_percentage: alcoholContent,
        ean_13: ean13,
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
                name="alcoholContent"
                control={control}
                render={({ field }) => (
                  <Input disabled={fetching} type="number" {...field} />
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>EAN13</FormLabel>
              <Controller
                name="ean13"
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

export default AddWine;
