"use client";

import {
  Barcodes_Constraint,
  Barcodes_Update_Column,
} from "@cellar-assistant/shared";
import {
  addWineMutation,
  type Wines_Insert_Input,
} from "@cellar-assistant/shared/queries";
import { Box, Grid, Stack, Typography } from "@mui/joy";
import { useActor } from "@xstate/react";
import { useRouter } from "next/navigation";
import { includes } from "ramda";
import { useCallback } from "react";
import { useClient } from "urql";
import { convertYearToDate, parseNumber } from "@/utilities";
import { Analyzing } from "../common/Analyzing";
import {
  type OnboardingResult,
  OnboardingWizard,
} from "../common/OnboardingWizard";
import { FinalPrompt } from "../common/OnboardingWizard/FinalPrompt";
import { OnboardingMachine } from "../common/OnboardingWizard/machines";
import { QuickAddCard } from "../common/QuickAddCard";
import { Searching } from "../common/Searching";
import { fetchDefaults } from "./actors/fetchDefaults";
import { insertCellarItem } from "./actors/insertCellarItem";
import { WineForm, type WineFormDefaultValues } from "./WineForm";

type WineOnboardingProps = {
  cellarId: string;
  userId: string;
};

export const WineOnboarding = ({ cellarId, userId }: WineOnboardingProps) => {
  const urqlClient = useClient();
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
        urqlClient,
        cellarId,
        router,
        userId,
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

  // Handle quick add confirmation - creates the wine and returns the ID
  const handleQuickAddConfirm = useCallback(async (): Promise<
    string | undefined
  > => {
    const defaults = state.context.defaults as WineFormDefaultValues;
    if (!defaults?.name) {
      console.error("Cannot quick add wine without a name");
      return undefined;
    }

    // Map defaults to insert input (similar to WineForm)
    const wineInput: Wines_Insert_Input = {
      name: defaults.name,
      description: defaults.description,
      region: defaults.region,
      country: defaults.country,
      special_designation: defaults.special_designation,
      vineyard_designation: defaults.vineyard_designation,
      variety: defaults.variety,
      style: defaults.style,
      alcohol_content_percentage: parseNumber(
        defaults.alcohol_content_percentage,
      ),
      vintage: defaults.vintage
        ? convertYearToDate(parseInt(defaults.vintage, 10))
        : undefined,
      item_onboarding_id: state.context.itemOnboardingId || undefined,
    };

    // Add barcode if available
    if (defaults.barcode_code) {
      wineInput.barcode = {
        data: {
          code: defaults.barcode_code,
          type: defaults.barcode_type,
        },
        on_conflict: {
          constraint: Barcodes_Constraint.BarcodesPkey,
          update_columns: [Barcodes_Update_Column.Code],
        },
      };
    }

    const result = await urqlClient.mutation(addWineMutation, {
      wine: wineInput,
    });

    if (result.error || !result.data?.insert_wines_one?.id) {
      console.error("Failed to create wine:", result.error);
      return undefined;
    }

    const itemId = result.data.insert_wines_one.id;
    send({ type: "CONFIRM", itemId });
    return itemId;
  }, [
    state.context.defaults,
    state.context.itemOnboardingId,
    urqlClient,
    send,
  ]);

  const handleQuickAddEdit = useCallback(() => {
    send({ type: "EDIT" });
  }, [send]);

  return (
    <Stack spacing={2}>
      <Typography level="h4">Add Wine</Typography>
      <Grid container spacing={2}>
        {state.value === "wizard" && (
          <Grid xs={12}>
            <Box sx={(theme) => ({ maxWidth: theme.breakpoints.values.lg })}>
              <OnboardingWizard onComplete={handleOnComplete} userId={userId} />
            </Box>
          </Grid>
        )}
        {(state.value === "addItemToCellar" ||
          state.value === "addExisting") && (
          <Grid xs={12} sm={6}>
            <Searching />
          </Grid>
        )}
        {includes(state.value, ["analyze", "retryAnalyze", "upload"]) && (
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
        {state.value === "quickReview" && (
          <Grid xs={12} sm={6}>
            <QuickAddCard
              defaults={state.context.defaults as WineFormDefaultValues}
              itemType="WINE"
              confidence={state.context.confidence ?? 0}
              onConfirm={handleQuickAddConfirm}
              onEdit={handleQuickAddEdit}
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
