import { Box, Card, Grid, LinearProgress, Stack, Typography } from "@mui/joy";
import { SpiritForm, SpiritFormDefaultValues } from "./SpiritForm";
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
  query GetSpiritDefaults($hint: item_defaults_hint!) {
    spirit_defaults(hint: $hint) {
      name
      description
      alcohol_content_percentage
      barcode_code
      barcode_type
      country
      distillery
      item_onboarding_id
      style
      type
      vintage
    }
  }
`);

type SpiritOnboardingProps = {
  cellarId: string;
  returnUrl: string;
};

export const SpiritOnboarding = ({
  cellarId,
  returnUrl,
}: SpiritOnboardingProps) => {
  const urqlClient = useClient();
  const nhostClient = useNhostClient();

  const fetchDefaults = fromPromise(
    async ({
      input: { barcode, frontLabelFileId, backLabelFileId },
    }: {
      input: fetchDefaultsInput;
    }): Promise<defaultValuesResult<SpiritFormDefaultValues>> => {
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
        isNil(result.data?.spirit_defaults)
      )
        throw Error();

      const spirit = nullsToUndefined(result.data.spirit_defaults);
      return {
        defaults: {
          name: spirit.name,
          description: spirit.description,
          vintage: spirit.vintage,
          alcohol_content_percentage: spirit.alcohol_content_percentage,
          style: spirit.style,
          barcode_code: spirit.barcode_code,
          barcode_type: spirit.barcode_type,
        },
        itemOnboardingId: result.data.spirit_defaults.item_onboarding_id,
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
      <Typography level="h4">Add Spirit</Typography>
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
            <SpiritForm
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
