import { Box, Card, Grid, LinearProgress, Stack, Typography } from "@mui/joy";
import { WineForm, WineFormDefaultValues } from "./WineForm";
import { OnboardingWizard, OnboardingResult } from "../common/OnboardingWizard";
import { BarcodeType } from "@/constants";
import { useNhostClient } from "@nhost/nextjs";
import { useClient } from "urql";
import { fromPromise } from "xstate";
import { useActor } from "@xstate/react";
import { graphql } from "@/gql";
import { nullsToUndefined } from "@/utilities";
import { isNil } from "ramda";
import {
  OnboardingMachine,
  defaultValuesResult,
  fetchDefaultsInput,
} from "../common/OnboardingWizard/machines";

const getDefaultsQuery = graphql(`
  query GetWineDefaults($hint: item_defaults_hint!) {
    wine_defaults(hint: $hint) {
      name
      description
      alcohol_content_percentage
      barcode_code
      barcode_type
      item_onboarding_id
      region
      special_designation
      variety
      vineyard_designation
      vintage
    }
  }
`);

type WineOnboardingProps = {
  cellarId: string;
  returnUrl: string;
};

export const WineOnboarding = ({
  cellarId,
  returnUrl,
}: WineOnboardingProps) => {
  const urqlClient = useClient();
  const nhostClient = useNhostClient();

  const fetchDefaults = fromPromise(
    async ({
      input: { barcode, frontLabelFileId, backLabelFileId },
    }: {
      input: fetchDefaultsInput;
    }): Promise<defaultValuesResult<WineFormDefaultValues>> => {
      const result = await urqlClient.query(getDefaultsQuery, {
        hint: {
          barcode: barcode?.text,
          barcodeType: barcode?.type,
          frontLabelFileId,
          backLabelFileId,
        },
      });
      if (
        isNil(result) ||
        isNil(result.data) ||
        isNil(result.data?.wine_defaults)
      )
        throw Error();

      const wine = nullsToUndefined(result.data.wine_defaults);
      return {
        defaults: {
          name: wine.name,
          description: wine.description,
          vintage: wine.vintage,
          alcohol_content_percentage: wine.alcohol_content_percentage,
          barcode_code: wine.barcode_code,
          barcode_type: wine.barcode_type,
          region: wine.region,
          variety: wine.variety,
          special_designation: wine.special_designation,
          vineyard_designation: wine.vineyard_designation,
        },
        itemOnboardingId: result.data.wine_defaults.item_onboarding_id,
      };
    },
  );

  const [state, send] = useActor(
    OnboardingMachine.provide({
      actors: {
        fetchDefaults,
      },
    }),
    {
      input: {
        nhostClient,
      },
    },
  );

  // TODO move this into machine, DUPED
  const handleOnComplete = ({
    barcode,
    frontLabelDataUrl,
    backLabelDataUrl,
  }: OnboardingResult) => {
    send({
      type: "COMPLETE",
      barcode: barcode,
      frontLabel: frontLabelDataUrl,
      backLabel: backLabelDataUrl,
    });
  };

  return (
    <Stack spacing={2}>
      <Typography level="h4">Add Wine</Typography>
      <Grid container spacing={2}>
        {state.value === "wizard" && (
          <Grid xs={12}>
            <Box sx={(theme) => ({ maxWidth: theme.breakpoints.values.lg })}>
              <OnboardingWizard onComplete={handleOnComplete} />
            </Box>
          </Grid>
        )}
        {state.value === "analyze" && (
          <Grid xs={12} sm={6}>
            <Card>
              <Stack spacing={2}>
                <Typography level="title-lg" textAlign="center">
                  Analyzing...
                </Typography>
                <LinearProgress />
              </Stack>
            </Card>
          </Grid>
        )}
        {state.value === "form" && (
          <Grid xs={12} justifyContent="center">
            <WineForm
              cellarId={cellarId}
              returnUrl={returnUrl}
              itemOnboardingId={state.context.itemOnboardingId}
              defaultValues={state.context.defaults}
            />
          </Grid>
        )}
      </Grid>
    </Stack>
  );
};
