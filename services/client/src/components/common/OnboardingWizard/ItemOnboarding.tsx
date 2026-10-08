"use client";

import { Alert, Box, Button, Grid, Stack, Typography } from "@mui/joy";
import { useActor } from "@xstate/react";
import { useRouter } from "next/navigation";
import { includes, isNotNil } from "ramda";
import { useCallback } from "react";
import { useClient } from "urql";
import {
  type ApiItemType,
  itemTypeLabel,
} from "@/components/cellar-api/itemTypes";
import { AiStatus } from "../AiStatus";
import { AnimationShowcase } from "../AnimationShowcase";
import { QuickAddCard } from "../QuickAddCard";
import { emptyDefaults, quickAddDefaultsFrom } from "./adapter";
import { CatalogMatchPrompt } from "./CatalogMatchPrompt";
import { FinalPrompt } from "./FinalPrompt";
import { type OnboardingResult, OnboardingWizard } from "./index";
import { OnboardingMachine } from "./machines";
import { OnboardingItemForm } from "./OnboardingItemForm";

type ItemOnboardingProps = {
  type: ApiItemType;
  cellarId?: string;
};

/**
 * The six `82450ad1:src/components/{type}/{T}Onboarding.tsx` — which differed
 * only in their form, their insert mutation and the heading — as one
 * component over `type`. Layout, states and copy are the old ones: the photo
 * wizard, "Analyzing..." / "Adding your item..." over `AnimationShowcase`, the
 * quick-add card, the form, then "Would you like to add another item?".
 *
 * Quick add's confirm is the form's save with the analysed values
 * (`createOnboardedItem`); the old one built a second, hand-copied insert per
 * type, and a field the card summarised could be one it never saved.
 */
export const ItemOnboarding = ({ type, cellarId }: ItemOnboardingProps) => {
  const urqlClient = useClient();
  const router = useRouter();

  const [state, send] = useActor(OnboardingMachine, {
    input: {
      urqlClient,
      cellarId,
      router,
      itemType: type,
    },
  });

  const handleOnComplete = useCallback(
    ({
      existingItemId,
      barcode,
      frontLabelDataUrl,
      backLabelDataUrl,
      displayImageDataUrl,
      declinedItemIds,
    }: OnboardingResult) => {
      send({
        type: "COMPLETE",
        barcode: barcode,
        frontLabel: frontLabelDataUrl,
        backLabel: backLabelDataUrl,
        existingItemId,
        displayImageDataUrl,
        declinedItemIds,
      });
    },
    [send],
  );

  // The scanner's code, as read off the label — not a stored (canonical) one,
  // so it is shown and sent as printed.
  const { barcode: scanned } = state.context;

  // Quick add files another bottle of the matched catalogue item (N02). It
  // creates nothing: the machine only reaches quickReview with a match.
  const { catalogMatch } = state.context;
  const handleQuickAddConfirm = useCallback(async (): Promise<
    string | undefined
  > => {
    send({ type: "CONFIRM" });
    return catalogMatch?.item.itemId;
  }, [catalogMatch, send]);

  const handleQuickAddEdit = useCallback(() => {
    send({ type: "EDIT" });
  }, [send]);

  const labelSent =
    isNotNil(state.context.frontLabelFileId) ||
    isNotNil(state.context.backLabelFileId);

  return (
    <Stack spacing={2}>
      <Typography level="h4">Add {itemTypeLabel(type)}</Typography>
      <Grid container spacing={2}>
        {state.value === "wizard" && (
          <Grid xs={12}>
            <Box sx={(theme) => ({ maxWidth: theme.breakpoints.values.lg })}>
              <OnboardingWizard onComplete={handleOnComplete} itemType={type} />
            </Box>
          </Grid>
        )}
        {(state.value === "addItemToCellar" ||
          state.value === "uploadImage" ||
          includes(state.value, [
            "analyze",
            "retryAnalyze",
            "upload",
            "matching",
          ])) && (
          <Grid xs={12}>
            <AnimationShowcase
              statusText={
                state.value === "matching"
                  ? "Looking for it in the catalog..."
                  : includes(state.value, ["analyze", "retryAnalyze", "upload"])
                    ? "Analyzing..."
                    : "Adding your item..."
              }
            />
          </Grid>
        )}
        {state.value === "addFailed" && (
          <Grid xs={12} sm={6}>
            <Alert color="danger" variant="soft">
              <Stack spacing={1}>
                <Typography>{state.context.error}</Typography>
                <Box>
                  <Button size="sm" onClick={() => send({ type: "RETRY" })}>
                    Try again
                  </Button>
                </Box>
              </Stack>
            </Alert>
          </Grid>
        )}
        {state.value === "finalPrompt" && (
          <Grid xs={12} sm={6}>
            <Stack spacing={2}>
              {isNotNil(state.context.imageError) && (
                <Alert color="warning" variant="soft">
                  The item was added, but its photo was not saved:{" "}
                  {state.context.imageError}
                </Alert>
              )}
              <FinalPrompt
                onYes={() => send({ type: "ADD_ANOTHER" })}
                onNo={() => send({ type: "DONE" })}
              />
            </Stack>
          </Grid>
        )}
        {state.value === "quickReview" && isNotNil(catalogMatch) && (
          <Grid xs={12} sm={6}>
            <QuickAddCard
              heading="Is it this one?"
              defaults={{
                ...quickAddDefaultsFrom(
                  type,
                  state.context.defaults ?? emptyDefaults(),
                ),
                // The card names the item it will file, not the read.
                name: catalogMatch.item.name,
                vintage: catalogMatch.item.vintage,
              }}
              itemType={type}
              confidence={state.context.confidence ?? 0}
              confirmLabel="+1 bottle"
              editLabel="Not this one"
              onConfirm={handleQuickAddConfirm}
              onEdit={handleQuickAddEdit}
            />
          </Grid>
        )}
        {state.value === "form" && (
          <Grid xs={12} justifyContent="center">
            <Stack spacing={2}>
              {isNotNil(state.context.error) && (
                <Alert color="warning" variant="soft">
                  {state.context.error}
                </Alert>
              )}
              {isNotNil(state.context.catalogMatch) && (
                <CatalogMatchPrompt
                  match={state.context.catalogMatch}
                  inCellar={isNotNil(cellarId)}
                  onUse={() => send({ type: "USE_MATCH" })}
                  onDismiss={() => send({ type: "DISMISS_MATCH" })}
                />
              )}
              {labelSent && isNotNil(state.context.extractionError) && (
                <AiStatus outcome={state.context.extractionError} />
              )}
              <OnboardingItemForm
                type={type}
                itemOnboardingId={state.context.itemOnboardingId}
                defaultValues={state.context.defaults ?? emptyDefaults()}
                sessionBarcode={scanned?.text}
                onCreated={(itemId: string) =>
                  send({ type: "CREATED", itemId })
                }
              />
            </Stack>
          </Grid>
        )}
      </Grid>
    </Stack>
  );
};
