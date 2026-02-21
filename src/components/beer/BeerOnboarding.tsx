"use client";

import {
  Barcodes_Constraint,
  Barcodes_Update_Column,
} from "@cellar-assistant/shared";
import {
  addBeerMutation,
  type Beers_Insert_Input,
} from "@cellar-assistant/shared/queries";
import { Box, Grid, Stack, Typography } from "@mui/joy";
import { useActor } from "@xstate/react";
import { useRouter } from "next/navigation";
import { includes } from "ramda";
import { useCallback } from "react";
import { useClient } from "urql";
import { convertYearToDate, parseNumber } from "@/utilities";
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
import { BeerForm, type BeerFormDefaultValues } from "./BeerForm";

type BeerOnboardingProps = {
  cellarId?: string;
  userId: string;
};

export const BeerOnboarding = ({ cellarId, userId }: BeerOnboardingProps) => {
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
        itemType: "beers",
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
    const defaults = state.context.defaults as BeerFormDefaultValues;
    if (!defaults?.name) {
      console.error("Cannot quick add beer without a name");
      return undefined;
    }

    const beerInput: Beers_Insert_Input = {
      name: defaults.name,
      description: defaults.description,
      country: defaults.country,
      style: defaults.style,
      alcohol_content_percentage: parseNumber(
        defaults.alcohol_content_percentage,
      ),
      international_bitterness_unit: defaults.international_bitterness_unit
        ? parseInt(String(defaults.international_bitterness_unit), 10)
        : undefined,
      vintage: defaults.vintage
        ? convertYearToDate(parseInt(defaults.vintage, 10))
        : undefined,
      item_onboarding_id: state.context.itemOnboardingId || undefined,
    };

    if (defaults.barcode_code) {
      beerInput.barcode = {
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

    const result = await urqlClient.mutation(addBeerMutation, {
      beer: beerInput,
    });

    if (result.error || !result.data?.insert_beers_one?.id) {
      console.error("Failed to create beer:", result.error);
      return undefined;
    }

    const itemId = result.data.insert_beers_one.id;

    // Link brand if available (non-blocking)
    if (defaults.brand_id) {
      await linkItemToBrand(urqlClient, itemId, defaults.brand_id, "beer");
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
      <Typography level="h4">Add Beer</Typography>
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
              defaults={state.context.defaults as BeerFormDefaultValues}
              itemType="BEER"
              confidence={state.context.confidence ?? 0}
              onConfirm={handleQuickAddConfirm}
              onEdit={handleQuickAddEdit}
            />
          </Grid>
        )}
        {state.value === "form" && (
          <Grid xs={12} justifyContent="center">
            <BeerForm
              itemOnboardingId={state.context.itemOnboardingId}
              defaultValues={state.context.defaults as BeerFormDefaultValues}
              onCreated={(itemId: string) => send({ type: "CREATED", itemId })}
            />
          </Grid>
        )}
      </Grid>
    </Stack>
  );
};
