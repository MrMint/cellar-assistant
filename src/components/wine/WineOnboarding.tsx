import {
  Box,
  Button,
  Card,
  CardActions,
  Grid,
  Sheet,
  Stack,
  Typography,
} from "@mui/joy";
import { WineForm, WineFormDefaultValues } from "./WineForm";
import { OnboardingWizard, OnboardingResult } from "../common/OnboardingWizard";
import { useNhostClient } from "@nhost/nextjs";
import { useClient } from "urql";
import { useActor } from "@xstate/react";
import { OnboardingMachine } from "../common/OnboardingWizard/machines";
import { Analyzing } from "../common/Analyzing";
import { useCallback } from "react";
import { fetchDefaults } from "./actors/fetchDefaults";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
  const [state, send] = useActor(
    OnboardingMachine.provide({
      actors: {
        fetchDefaults,
      },
    }),
    {
      input: {
        nhostClient,
        urqlClient,
        cellarId,
        router,
      },
    },
  );

  // TODO move this into machine, DUPED
  const handleOnComplete = useCallback(
    ({
      existingItemId,
      barcode,
      frontLabelDataUrl,
      backLabelDataUrl,
    }: OnboardingResult) => {
      send({
        type: "COMPLETE",
        barcode: barcode,
        frontLabel: frontLabelDataUrl,
        backLabel: backLabelDataUrl,
        existingItemId,
      });
    },
    [send],
  );

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
        {(state.value === "upload" ||
          state.value === "analyze" ||
          state.value === "addExisting") && (
          <Grid xs={12} sm={6}>
            <Analyzing />
          </Grid>
        )}
        {state.value === "finalPrompt" && (
          <Grid xs={12} sm={6}>
            <Card>
              <Stack spacing={2}>
                <Typography level="title-lg">
                  Would you like to add another item?
                </Typography>
              </Stack>
              <CardActions
                buttonFlex="0 1 120px"
                sx={{ justifyContent: "flex-end" }}
              >
                <Button
                  onClick={() => send({ type: "DONE" })}
                  variant="outlined"
                  color="neutral"
                >
                  No
                </Button>
                <Button onClick={() => send({ type: "ADD_ANOTHER" })}>
                  Yes
                </Button>
              </CardActions>
            </Card>
          </Grid>
        )}
        {state.value === "form" && (
          <Grid xs={12} justifyContent="center">
            <WineForm
              cellarId={cellarId}
              returnUrl={returnUrl}
              itemOnboardingId={state.context.itemOnboardingId}
              defaultValues={state.context.defaults as WineFormDefaultValues}
            />
          </Grid>
        )}
      </Grid>
    </Stack>
  );
};
