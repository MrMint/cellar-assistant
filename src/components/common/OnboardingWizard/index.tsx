import { Box, CircularProgress, Stack, Typography } from "@mui/joy";
import { useMachine } from "@xstate/react";
import { includes, isNotNil } from "ramda";
import { useClient } from "urql";
import { Barcode } from "@/constants";
import { Analyzing } from "../Analyzing";
import { Searching } from "../Searching";
import { BarcodeStep } from "./BarcodeStep";
import { DisplayPictureStep } from "./DisplayPictureStep";
import { ExistingItems } from "./ExistingItems";
import { PictureStep } from "./PictureStep";
import { SearchingStep } from "./SearchingStep";
import { pictureOnboardingMachine } from "./machines";

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

  return (
    <>
      {state.value === "barcode" && (
        <BarcodeStep
          barcode={state.context.barcode}
          onBarcodeChange={(barcode) => send({ type: "FOUND", barcode })}
          onSkip={() => send({ type: "SKIP" })}
        />
      )}
      {includes(state.value, ["searching", "searchingByImage"]) && (
        <SearchingStep />
      )}
      {includes(state.value, ["chooseExisting", "chooseExistingImage"]) &&
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
