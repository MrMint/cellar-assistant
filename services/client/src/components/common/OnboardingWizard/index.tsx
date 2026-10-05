"use client";

import { useMachine } from "@xstate/react";
import { includes, isNotNil } from "ramda";
import { useClient } from "urql";
import type { Barcode } from "@/constants";
import { AnimationShowcase } from "../AnimationShowcase";
import { BarcodeStep } from "./BarcodeStep";
import { DisplayPictureStep } from "./DisplayPictureStep";
import { ExistingItems } from "./ExistingItems";
import { pictureOnboardingMachine } from "./machines";
import { PictureStep } from "./PictureStep";

export type OnboardingResult = {
  barcode?: Barcode;
  frontLabelDataUrl?: string;
  backLabelDataUrl?: string;
  displayImageDataUrl?: string;
  existingItemId?: string;
};

export type OnboardingWizardProps = {
  onComplete: (result: OnboardingResult) => void;
};

/**
 * `82450ad1:src/components/common/OnboardingWizard/index.tsx`: barcode →
 * (existing matches) → back label → front label → display photo. Verbatim
 * except that `userId` is gone (nothing sends one) and the image-search
 * states are (G32).
 */
export const OnboardingWizard = ({ onComplete }: OnboardingWizardProps) => {
  const urqlClient = useClient();

  const [state, send] = useMachine(
    pictureOnboardingMachine.provide({
      actions: {
        handleDone: ({
          context: {
            barcode,
            backLabelDataUrl,
            frontLabelDataUrl,
            displayImageDataUrl,
            existingItemId,
          },
        }) =>
          onComplete({
            barcode,
            frontLabelDataUrl,
            backLabelDataUrl,
            displayImageDataUrl,
            existingItemId,
          }),
      },
    }),
    { input: { urqlClient } },
  );

  const { barcode } = state.context;

  return (
    <>
      {state.value === "barcode" && (
        <BarcodeStep
          barcode={barcode}
          onBarcodeChange={(barcode) => send({ type: "FOUND", barcode })}
          onSkip={() => send({ type: "SKIP" })}
        />
      )}
      {includes(state.value, ["searching"]) && (
        <AnimationShowcase statusText="Searching..." />
      )}
      {includes(state.value, ["chooseExisting"]) &&
        isNotNil(state.context.existingItems) && (
          <ExistingItems
            items={state.context.existingItems}
            onClickItem={(existingItemId) =>
              send({ type: "CHOOSE_ITEM", existingItemId })
            }
            onSkip={() => send({ type: "SKIP" })}
          />
        )}
      {state.value === "front" && (
        <PictureStep
          header="Lets take a picture of the front label"
          picture={state.context.frontLabelDataUrl}
          onCapture={(image) => send({ type: "CAPTURED", image })}
          onSkip={() => send({ type: "SKIP" })}
          onBack={() => send({ type: "BACK" })}
        />
      )}
      {state.value === "back" && (
        <PictureStep
          header="Lets take a picture of the back label"
          picture={state.context.backLabelDataUrl}
          onCapture={(image) => send({ type: "CAPTURED", image })}
          onSkip={() => send({ type: "SKIP" })}
          onBack={() => send({ type: "BACK" })}
        />
      )}
      {state.value === "display" && (
        <DisplayPictureStep
          onCapture={(image) => send({ type: "CAPTURED", image })}
          onSkip={() => send({ type: "SKIP" })}
          onBack={() => send({ type: "BACK" })}
        />
      )}
    </>
  );
};
