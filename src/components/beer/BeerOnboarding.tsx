import { Box, Card, Grid, LinearProgress, Stack, Typography } from "@mui/joy";
import { BeerForm, BeerFormDefaultValues } from "./BeerForm";
import { OnboardingWizard, OnboardingResult } from "../common/OnboardingWizard";
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
import { Analyzing } from "../common/Analyzing";

const getDefaultsQuery = graphql(`
  query GetBeerDefaults($hint: item_defaults_hint!) {
    beer_defaults(hint: $hint) {
      name
      description
      alcohol_content_percentage
      vintage
      barcode_code
      barcode_type
      country
      international_bitterness_unit
      style
      item_onboarding_id
    }
  }
`);

type BeerOnboardingProps = {
  cellarId: string;
  returnUrl: string;
};

export const BeerOnboarding = ({
  cellarId,
  returnUrl,
}: BeerOnboardingProps) => {
  const urqlClient = useClient();
  const nhostClient = useNhostClient();

  const fetchDefaults = fromPromise(
    async ({
      input: { barcode, frontLabelFileId, backLabelFileId },
    }: {
      input: fetchDefaultsInput;
    }): Promise<defaultValuesResult<BeerFormDefaultValues>> => {
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
        isNil(result.data?.beer_defaults)
      )
        throw Error();

      const beer = nullsToUndefined(result.data.beer_defaults);
      return {
        defaults: {
          name: beer.name,
          description: beer.description,
          vintage: beer.vintage,
          alcohol_content_percentage: beer.alcohol_content_percentage,
          style: beer.style,
          international_bitterness_unit: beer.international_bitterness_unit,
          barcode_code: beer.barcode_code,
          barcode_type: beer.barcode_type,
        },
        itemOnboardingId: result.data.beer_defaults.item_onboarding_id,
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
      <Typography level="h4">Add Beer</Typography>
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
            <Analyzing />
          </Grid>
        )}
        {state.value === "form" && (
          <Grid xs={12} justifyContent="center">
            <BeerForm
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
