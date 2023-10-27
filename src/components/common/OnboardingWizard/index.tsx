import { assign, createMachine } from "xstate";
import { useMachine } from "@xstate/react";
import { Barcode } from "@/constants";
import { BarcodeStep } from "./BarcodeStep";
import { PictureStep } from "./PictureStep";

const toggleMachine = createMachine({
  id: "onboarding-wizard",
  initial: "barcode",
  types: {} as {
    context: {
      barcode?: Barcode;
      frontLabelDataUrl?: string;
      backLabelDataUrl?: string;
    };
    events:
      | {
          type: "FOUND";
          barcode?: Barcode;
        }
      | { type: "SKIP" }
      | { type: "BACK" }
      | { type: "CAPTURED"; image: string };
    actions: { type: "handleDone" };
  },
  states: {
    barcode: {
      on: {
        FOUND: {
          actions: assign({
            barcode: ({ event }) => event.barcode,
          }),
          target: "clearing",
        },
        SKIP: "clearing",
      },
    },
    clearing: {
      after: {
        // We need to delay a bit to give time for the camera to deal with new video constraints
        50: { target: "front" },
      },
    },
    front: {
      on: {
        CAPTURED: {
          actions: assign({
            frontLabelDataUrl: ({ event }) => event.image,
          }),
          target: "back",
        },
        BACK: "barcode",
        SKIP: "back",
      },
    },
    back: {
      on: {
        CAPTURED: {
          actions: assign({
            backLabelDataUrl: ({ event }) => event.image,
          }),
          target: "done",
        },
        BACK: "front",
        SKIP: "done",
      },
    },
    done: {
      entry: ["handleDone"],
      type: "final",
    },
  },
});

export type OnboardingResult = {
  barcode?: Barcode;
  frontLabelDataUrl?: string;
  backLabelDataUrl?: string;
};

export type OnboardingWizardProps = {
  onComplete: (result: OnboardingResult) => void;
};

export const OnboardingWizard = ({ onComplete }: OnboardingWizardProps) => {
  const [state, send] = useMachine(
    toggleMachine.provide({
      actions: {
        handleDone: ({
          context: { barcode, backLabelDataUrl, frontLabelDataUrl },
        }) => onComplete({ barcode, frontLabelDataUrl, backLabelDataUrl }),
      },
    }),
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
