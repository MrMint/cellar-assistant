"use client";

import {
  Barcodes_Constraint,
  Barcodes_Update_Column,
} from "@cellar-assistant/shared";
import {
  addSpiritMutation,
  type Spirits_Insert_Input,
} from "@cellar-assistant/shared/queries";
import { Box, Grid, Stack, Typography } from "@mui/joy";
import { useActor } from "@xstate/react";
import { useRouter } from "next/navigation";
import { includes } from "ramda";
import { useCallback } from "react";
import { useClient } from "urql";
import { convertYearToDate, parseNumber } from "@/utilities";
import { linkItemToBrand } from "@/utilities/brand";
import { Analyzing } from "../common/Analyzing";
import {
  type OnboardingResult,
  OnboardingWizard,
} from "../common/OnboardingWizard";
import { FinalPrompt } from "../common/OnboardingWizard/FinalPrompt";
import { OnboardingMachine } from "../common/OnboardingWizard/machines";
import { QuickAddCard } from "../common/QuickAddCard";
import { Searching } from "../common/Searching";
import { uploadItemImage } from "../common/OnboardingWizard/actors/uploadItemImage";
import { fetchDefaults } from "./actors/fetchDefaults";
import { insertCellarItem } from "./actors/insertCellarItem";
import { SpiritForm, type SpiritFormDefaultValues } from "./SpiritForm";

type SpiritOnboardingProps = {
  cellarId?: string;
  userId: string;
};

export const SpiritOnboarding = ({
  cellarId,
  userId,
}: SpiritOnboardingProps) => {
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
        itemType: "spirits",
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
    const defaults = state.context.defaults as SpiritFormDefaultValues;
    if (!defaults?.name) {
      console.error("Cannot quick add spirit without a name");
      return undefined;
    }

    const spiritInput: Spirits_Insert_Input = {
      name: defaults.name,
      description: defaults.description,
      country: defaults.country,
      style: defaults.style,
      type: defaults.type,
      alcohol_content_percentage: parseNumber(
        defaults.alcohol_content_percentage,
      ),
      vintage: defaults.vintage
        ? convertYearToDate(parseInt(defaults.vintage, 10))
        : undefined,
      item_onboarding_id: state.context.itemOnboardingId || undefined,
    };

    if (defaults.barcode_code) {
      spiritInput.barcode = {
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

    const result = await urqlClient.mutation(addSpiritMutation, {
      spirit: spiritInput,
    });

    if (result.error || !result.data?.insert_spirits_one?.id) {
      console.error("Failed to create spirit:", result.error);
      return undefined;
    }

    const itemId = result.data.insert_spirits_one.id;

    // Link brand if available (non-blocking)
    if (defaults.brand_id) {
      await linkItemToBrand(urqlClient, itemId, defaults.brand_id, "spirit");
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
      <Typography level="h4">Add Spirit</Typography>
      <Grid container spacing={2}>
        {state.value === "wizard" && (
          <Grid xs={12}>
            <Box sx={(theme) => ({ maxWidth: theme.breakpoints.values.lg })}>
              <OnboardingWizard onComplete={handleOnComplete} userId={userId} />
            </Box>
          </Grid>
        )}
        {(state.value === "addItemToCellar" ||
          state.value === "uploadImage") && (
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
              defaults={state.context.defaults as SpiritFormDefaultValues}
              itemType="SPIRIT"
              confidence={state.context.confidence ?? 0}
              onConfirm={handleQuickAddConfirm}
              onEdit={handleQuickAddEdit}
            />
          </Grid>
        )}
        {state.value === "form" && (
          <Grid xs={12} justifyContent="center">
            <SpiritForm
              itemOnboardingId={state.context.itemOnboardingId}
              defaultValues={state.context.defaults as SpiritFormDefaultValues}
              onCreated={(itemId: string) => send({ type: "CREATED", itemId })}
            />
          </Grid>
        )}
      </Grid>
    </Stack>
  );
};
