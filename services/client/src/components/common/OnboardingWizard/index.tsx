"use client";

import { useMachine } from "@xstate/react";
import { type ReactNode, useCallback } from "react";
import { useClient } from "urql";
import { BottomSheet } from "@/components/app/BottomSheet";
import { CaptureCamera } from "@/components/capture/CaptureCamera";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Barcode } from "@/constants";
import { MatchList } from "./MatchList";
import { pictureOnboardingMachine } from "./machines";

export type OnboardingResult = {
  barcode?: Barcode;
  frontLabelDataUrl?: string;
  /** For a chosen existing item: its optional photo. A new one's is the front. */
  displayImageDataUrl?: string;
  existingItemId?: string;
  existingItemType?: ApiItemType;
  existingItemName?: string;
  /** Matches the person passed over in the chooser ("None of these"). */
  declinedItemIds?: readonly string[];
};

export type OnboardingWizardProps = {
  onComplete: (result: OnboardingResult) => void;
  /** The type being added. */
  itemType?: ApiItemType;
  /** In a cellar a known item is "+1 bottle"; elsewhere "Use this". */
  inCellar?: boolean;
  /** Right under the camera: the capture surface's mode row (X06). */
  belowCamera?: ReactNode;
};

/**
 * The capture step, snap-once (X05; N21's order barcode → front → optional
 * back, without the steps): **one live camera**. While you frame the front
 * label it reads any barcode in the picture; a code the catalogue knows asks
 * "Is it one of these?" in a sheet over the camera, and a code it does not
 * just rides along with the photo. The shutter photographs the front label
 * and the step ends — the read starts at the shutter, and the same photo is
 * the display photo (N21) and the photo-search query (D12). The back label is
 * the draft card's optional "Add back label". "Type it in instead" skips the
 * photo.
 */
export const OnboardingWizard = ({
  onComplete,
  itemType,
  inCellar = false,
  belowCamera,
}: OnboardingWizardProps) => {
  const urqlClient = useClient();

  const [state, send] = useMachine(
    pictureOnboardingMachine.provide({
      actions: {
        handleDone: ({
          context: {
            barcode,
            frontLabelDataUrl,
            displayImageDataUrl,
            chosen,
            declinedItemIds,
          },
        }) =>
          onComplete({
            barcode,
            frontLabelDataUrl,
            displayImageDataUrl,
            existingItemId: chosen?.item.itemId,
            existingItemType: chosen?.type,
            existingItemName: chosen?.item.name,
            declinedItemIds,
          }),
      },
    }),
    { input: { urqlClient, itemType } },
  );

  const { barcode, chosen, existingItems } = state.context;
  const framing = state.matches("framing") || state.matches("searching");
  const onBarcode = useCallback(
    (code: Barcode) => send({ type: "BARCODE", barcode: code }),
    [send],
  );

  return (
    <div data-slot="capture-step" className="flex flex-col gap-3">
      <CaptureCamera
        onCapture={(image) => send({ type: "CAPTURED", image })}
        // The reader runs only while framing; a known code stops it.
        onBarcode={framing ? onBarcode : undefined}
        barcode={barcode}
        shutterLabel={
          state.matches("photo") ? "Take a photo of it" : "Take photo"
        }
        overlay={
          state.matches("searching") ? (
            <p
              role="status"
              className="inline-flex h-7 items-center gap-1.5 rounded-full bg-black/40 px-3 font-medium text-[13px] text-white/85 backdrop-blur-sm"
            >
              <Spinner aria-hidden className="size-3.5" />
              Looking it up
            </p>
          ) : undefined
        }
      />
      {belowCamera}

      {state.matches("photo") && chosen !== undefined ? (
        <div className="flex flex-col gap-2">
          <p className="type-callout text-ink-2">
            <span className="text-ink-1">{chosen.item.name}</span> — snap it for
            its photo, or skip.
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => send({ type: "SKIP" })}
            >
              Skip the photo
            </Button>
            <Button variant="ghost" onClick={() => send({ type: "BACK" })}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="type-callout text-ink-2">
            Fill the frame with the front label. It&rsquo;s read as soon as you
            snap.
          </p>
          <Button variant="ghost" onClick={() => send({ type: "MANUAL" })}>
            Type it in instead
          </Button>
        </div>
      )}

      <BottomSheet
        open={state.matches("chooseExisting")}
        onOpenChange={(open) => {
          if (!open && state.matches("chooseExisting")) send({ type: "SKIP" });
        }}
        title="Is it one of these?"
        description={
          barcode === undefined ? undefined : `Barcode ${barcode.text}`
        }
        footer={
          <Button variant="secondary" onClick={() => send({ type: "SKIP" })}>
            None of these — snap the label
          </Button>
        }
      >
        {existingItems !== undefined && (
          <MatchList
            matches={existingItems}
            inCellar={inCellar}
            onChoose={(item) => send({ type: "CHOOSE_ITEM", item })}
          />
        )}
      </BottomSheet>
    </div>
  );
};
