import { useMachine } from "@xstate/react";
import { Barcode } from "@/constants";
import { BarcodeStep } from "./BarcodeStep";
import { PictureStep } from "./PictureStep";
import { pictureOnboardingMachine } from "./machines";
import { Analyzing } from "../Analyzing";
import { ExistingItems } from "./ExistingItems";
import { isNotNil } from "ramda";
import { useClient } from "urql";

export type OnboardingResult = {
  barcode?: Barcode;
  frontLabelDataUrl?: string;
  backLabelDataUrl?: string;
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
            existingItemId,
          },
        }) =>
          onComplete({
            barcode,
            frontLabelDataUrl,
            backLabelDataUrl,
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
      {state.value === "searching" && <Analyzing />}
      {state.value === "chooseExisting" &&
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
    </>
  );
};
