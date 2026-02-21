"use client";

import {
  Barcodes_Constraint,
  Barcodes_Update_Column,
} from "@cellar-assistant/shared";
import {
  addCoffeeMutation,
  type Coffees_Insert_Input,
} from "@cellar-assistant/shared/queries";
import { Box, Grid, Stack, Typography } from "@mui/joy";
import { useActor } from "@xstate/react";
import { useRouter } from "next/navigation";
import { includes } from "ramda";
import { useCallback } from "react";
import { useClient } from "urql";
import { linkItemToBrand } from "@/utilities/brand";
import { AnimationShowcase } from "../common/AnimationShowcase";
import {
  type OnboardingResult,
  OnboardingWizard,
} from "../common/OnboardingWizard";
import { FinalPrompt } from "../common/OnboardingWizard/FinalPrompt";
import { OnboardingMachine } from "../common/OnboardingWizard/machines";
import { QuickAddCard } from "../common/QuickAddCard";
import { uploadItemImage } from "../common/OnboardingWizard/actors/uploadItemImage";
import { fetchDefaults } from "./actors/fetchDefaults";
import { insertCellarItem } from "./actors/insertCellarItem";
import { CoffeeForm, type CoffeeFormDefaultValues } from "./CoffeeForm";

type CoffeeOnboardingProps = {
  cellarId?: string;
  userId: string;
};

export const CoffeeOnboarding = ({
  cellarId,
  userId,
}: CoffeeOnboardingProps) => {
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
        itemType: "coffees",
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
    const defaults = state.context.defaults as CoffeeFormDefaultValues;
    if (!defaults?.name) {
      console.error("Cannot quick add coffee without a name");
      return undefined;
    }

    const coffeeInput: Coffees_Insert_Input = {
      name: defaults.name,
      description: defaults.description,
      country: defaults.country,
      roast_level: defaults.roast_level,
      species: defaults.species,
      process: defaults.process,
      cultivar: defaults.cultivar,
      item_onboarding_id: state.context.itemOnboardingId || undefined,
    };

    if (defaults.barcode_code) {
      coffeeInput.barcode = {
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

    const result = await urqlClient.mutation(addCoffeeMutation, {
      coffee: coffeeInput,
    });

    if (result.error || !result.data?.insert_coffees_one?.id) {
      console.error("Failed to create coffee:", result.error);
      return undefined;
    }

    const itemId = result.data.insert_coffees_one.id;

    // Link brand if available (non-blocking)
    if (defaults.brand_id) {
      await linkItemToBrand(urqlClient, itemId, defaults.brand_id, "coffee");
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
      <Typography level="h4">Add Coffee</Typography>
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
              defaults={state.context.defaults as CoffeeFormDefaultValues}
              itemType="COFFEE"
              confidence={state.context.confidence ?? 0}
              onConfirm={handleQuickAddConfirm}
              onEdit={handleQuickAddEdit}
            />
          </Grid>
        )}
        {state.value === "form" && (
          <Grid xs={12} justifyContent="center">
            <CoffeeForm
              itemOnboardingId={state.context.itemOnboardingId}
              defaultValues={state.context.defaults as CoffeeFormDefaultValues}
              onCreated={(itemId: string) => send({ type: "CREATED", itemId })}
            />
          </Grid>
        )}
      </Grid>
    </Stack>
  );
};
