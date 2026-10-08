"use client";

import { useActor } from "@xstate/react";
import { useRouter } from "next/navigation";
import { includes, isNotNil } from "ramda";
import { useCallback } from "react";
import { useClient } from "urql";
import { ErrorIcon, Warning } from "@/components/app/icons";
import {
  type ApiItemType,
  itemTypeLabel,
} from "@/components/cellar-api/itemTypes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AiStatus } from "../AiStatus";
import { AnimationShowcase } from "../AnimationShowcase";
import { QuickAddCard } from "../QuickAddCard";
import { emptyDefaults } from "./adapter";
import { CatalogMatchPrompt } from "./CatalogMatchPrompt";
import { catalogMatchSummary } from "./catalog-match";
import { FinalPrompt } from "./FinalPrompt";
import { type OnboardingResult, OnboardingWizard } from "./index";
import { OnboardingMachine } from "./machines";
import { OnboardingItemForm } from "./OnboardingItemForm";

/** Joy's `Grid xs=12 sm=6`: the full width on phones, half from `sm`. */
const HALF = "w-full sm:w-1/2";

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
    <div className="flex flex-col gap-4">
      <h1 className="type-title-2 text-ink-1">Add {itemTypeLabel(type)}</h1>
      {state.value === "wizard" && (
        <div className="w-full max-w-[1200px]">
          <OnboardingWizard onComplete={handleOnComplete} itemType={type} />
        </div>
      )}
      {(state.value === "addItemToCellar" ||
        state.value === "uploadImage" ||
        includes(state.value, [
          "analyze",
          "retryAnalyze",
          "upload",
          "matching",
        ])) && (
        <AnimationShowcase
          statusText={
            state.value === "matching"
              ? "Looking for it in the catalog..."
              : includes(state.value, ["analyze", "retryAnalyze", "upload"])
                ? "Analyzing..."
                : "Adding your item..."
          }
        />
      )}
      {state.value === "addFailed" && (
        <div className={HALF}>
          <Alert variant="destructive">
            <ErrorIcon aria-hidden />
            <AlertDescription className="gap-2">
              <p>{state.context.error}</p>
              <Button onClick={() => send({ type: "RETRY" })}>Try again</Button>
            </AlertDescription>
          </Alert>
        </div>
      )}
      {state.value === "finalPrompt" && (
        <div className={cn(HALF, "flex flex-col gap-4")}>
          {isNotNil(state.context.imageError) && (
            <Alert>
              <Warning aria-hidden />
              <AlertDescription className="text-ink-1">
                <p>
                  The item was added, but its photo was not saved:{" "}
                  {state.context.imageError}
                </p>
              </AlertDescription>
            </Alert>
          )}
          <FinalPrompt
            onYes={() => send({ type: "ADD_ANOTHER" })}
            onNo={() => send({ type: "DONE" })}
          />
        </div>
      )}
      {state.value === "quickReview" && isNotNil(catalogMatch) && (
        <div className={HALF}>
          <QuickAddCard
            heading="Is it this one?"
            // The card names the item it will file, in the catalogue's
            // words — not the label read's, and not its raw enum codes.
            defaults={{
              name: catalogMatch.item.name,
              vintage: catalogMatch.item.vintage,
              brand_name: catalogMatch.brandName,
            }}
            summary={catalogMatchSummary(catalogMatch)}
            itemType={type}
            confidence={state.context.confidence ?? 0}
            confirmLabel="+1 bottle"
            editLabel="Not this one"
            onConfirm={handleQuickAddConfirm}
            onEdit={handleQuickAddEdit}
          />
        </div>
      )}
      {state.value === "form" && (
        <div className="flex flex-col gap-4">
          {isNotNil(state.context.error) && (
            <Alert>
              <Warning aria-hidden />
              <AlertDescription className="text-ink-1">
                <p>{state.context.error}</p>
              </AlertDescription>
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
            onCreated={(itemId: string) => send({ type: "CREATED", itemId })}
          />
        </div>
      )}
    </div>
  );
};
