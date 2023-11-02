import { Box, Grid, Stack, Typography } from "@mui/joy";
import { useNhostClient } from "@nhost/nextjs";
import { useActor } from "@xstate/react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useClient } from "urql";
import { Analyzing } from "../common/Analyzing";
import { OnboardingWizard, OnboardingResult } from "../common/OnboardingWizard";
import { FinalPrompt } from "../common/OnboardingWizard/FinalPrompt";
import { OnboardingMachine } from "../common/OnboardingWizard/machines";
import { Searching } from "../common/Searching";
import { WineForm, WineFormDefaultValues } from "./WineForm";
import { fetchDefaults } from "./actors/fetchDefaults";
import { insertCellarItem } from "./actors/insertCellarItem";

type WineOnboardingProps = {
  cellarId: string;
};

export const WineOnboarding = ({ cellarId }: WineOnboardingProps) => {
  const urqlClient = useClient();
  const nhostClient = useNhostClient();
  const router = useRouter();

  const [state, send] = useActor(
    OnboardingMachine.provide({
      actors: {
        fetchDefaults,
        insertCellarItem,
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
      displayImageDataUrl,
    }: OnboardingResult) => {
      send({
        type: "COMPLETE",
        barcode: barcode,
        frontLabel: frontLabelDataUrl,
        backLabel: backLabelDataUrl,
        existingItemId,
        displayImageDataUrl,
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
        {(state.value === "addItemToCellar" ||
          state.value === "addExisting") && (
          <Grid xs={12} sm={6}>
            <Searching />
          </Grid>
        )}
        {(state.value === "analyze" || state.value === "upload") && (
          <Grid xs={12} sm={6}>
            <Analyzing />
          </Grid>
        )}
        {state.value === "finalPrompt" && (
          <Grid xs={12} sm={6}>
            <FinalPrompt
              onYes={() => send({ type: "ADD_ANOTHER" })}
              onNo={() => send({ type: "DONE" })}
            />
          </Grid>
        )}
        {state.value === "form" && (
          <Grid xs={12} justifyContent="center">
            <WineForm
              itemOnboardingId={state.context.itemOnboardingId}
              defaultValues={state.context.defaults as WineFormDefaultValues}
              onCreated={(itemId: string) => send({ type: "CREATED", itemId })}
            />
          </Grid>
        )}
      </Grid>
    </Stack>
  );
};
