"use client";

import {
  Barcodes_Constraint,
  Barcodes_Update_Column,
} from "@cellar-assistant/shared";
import {
  addTeaMutation,
  type Teas_Insert_Input,
} from "@cellar-assistant/shared/queries";
import { Box, Grid, Stack, Typography } from "@mui/joy";
import { useActor } from "@xstate/react";
import { useRouter } from "next/navigation";
import { includes } from "ramda";
import { useCallback } from "react";
import { useClient } from "urql";
import { parseNumber } from "@/utilities";
import { linkItemToBrand } from "@/utilities/brand";
import { AnimationShowcase } from "../common/AnimationShowcase";
import {
  type OnboardingResult,
  OnboardingWizard,
} from "../common/OnboardingWizard";
import { uploadItemImage } from "../common/OnboardingWizard/actors/uploadItemImage";
import { FinalPrompt } from "../common/OnboardingWizard/FinalPrompt";
import { OnboardingMachine } from "../common/OnboardingWizard/machines";
import { QuickAddCard } from "../common/QuickAddCard";
import { fetchDefaults } from "./actors/fetchDefaults";
import { insertCellarItem } from "./actors/insertCellarItem";
import { TeaForm, type TeaFormDefaultValues } from "./TeaForm";

type TeaOnboardingProps = {
  cellarId?: string;
  userId: string;
};

export const TeaOnboarding = ({ cellarId, userId }: TeaOnboardingProps) => {
  const urqlClient = useClient();
  const router = useRouter();

  const [state, send] = useActor(
    OnboardingMachine.provide({
      actors: {
        fetchDefaults,
        insertCellarItem,
        uploadItemImage,
      },
    }),
    {
      input: {
        urqlClient,
        cellarId,
        router,
        userId,
        itemType: "teas",
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

  const handleQuickAddConfirm = useCallback(async (): Promise<
    string | undefined
  > => {
    const defaults = state.context.defaults as TeaFormDefaultValues;
    if (!defaults?.name) {
      console.error("Cannot quick add tea without a name");
      return undefined;
    }

    const teaInput: Teas_Insert_Input = {
      name: defaults.name,
      description: defaults.description,
      country: defaults.country,
      region: defaults.region,
      category: defaults.category,
      form: defaults.form,
      caffeine_level: defaults.caffeine_level,
      cultivar: defaults.cultivar,
      oxidation_level: defaults.oxidation_level,
      processing: defaults.processing,
      ingredients: defaults.ingredients,
      steeping_temperature: defaults.steeping_temperature,
      steeping_time: defaults.steeping_time,
      flavor_profile: defaults.flavor_profile,
      is_organic: defaults.is_organic,
      is_fair_trade: defaults.is_fair_trade,
      harvest_year: parseNumber(defaults.harvest_year),
      item_onboarding_id: state.context.itemOnboardingId || undefined,
    };

    if (defaults.barcode_code) {
      teaInput.barcode = {
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

    const result = await urqlClient.mutation(addTeaMutation, {
      tea: teaInput,
    });

    if (result.error || !result.data?.insert_teas_one?.id) {
      console.error("Failed to create tea:", result.error);
      return undefined;
    }

    const itemId = result.data.insert_teas_one.id;

    // Link brand if available (non-blocking)
    if (defaults.brand_id) {
      await linkItemToBrand(urqlClient, itemId, defaults.brand_id, "tea");
    }

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
      <Typography level="h4">Add Tea</Typography>
      <Grid container spacing={2}>
        {state.value === "wizard" && (
          <Grid xs={12}>
            <Box sx={(theme) => ({ maxWidth: theme.breakpoints.values.lg })}>
              <OnboardingWizard onComplete={handleOnComplete} userId={userId} />
            </Box>
          </Grid>
        )}
        {(state.value === "addItemToCellar" ||
          state.value === "uploadImage" ||
          includes(state.value, ["analyze", "retryAnalyze", "upload"])) && (
          <Grid xs={12}>
            <AnimationShowcase
              statusText={
                includes(state.value, ["analyze", "retryAnalyze", "upload"])
                  ? "Analyzing..."
                  : "Adding your item..."
              }
            />
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
              defaults={state.context.defaults as TeaFormDefaultValues}
              itemType="TEA"
              confidence={state.context.confidence ?? 0}
              onConfirm={handleQuickAddConfirm}
              onEdit={handleQuickAddEdit}
            />
          </Grid>
        )}
        {state.value === "form" && (
          <Grid xs={12} justifyContent="center">
            <TeaForm
              itemOnboardingId={state.context.itemOnboardingId}
              defaultValues={state.context.defaults as TeaFormDefaultValues}
              onCreated={(itemId: string) => send({ type: "CREATED", itemId })}
            />
          </Grid>
        )}
      </Grid>
    </Stack>
  );
};
