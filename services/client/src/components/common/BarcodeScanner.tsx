"use client";

import { useEffect, useRef } from "react";
import { IconButton } from "@/components/app/IconButton";
import { Close } from "@/components/app/icons";
import { CaptureCamera } from "@/components/capture/CaptureCamera";
import { CaptureHeader } from "@/components/capture/CaptureChrome";
import type { Barcode } from "@/constants";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";

export type ScanMode = "barcode" | "photo";

const TITLES: Readonly<Record<ScanMode, string>> = {
  barcode: "Scan a barcode",
  photo: "Search by photo",
};

/**
 * Search's scan and camera sheets (Recipes-Search 29, 40), drawn with the
 * Capture-Camera chrome that won CROSS-LOT: a title bar with Close, the
 * one live camera, a Barcode · Photo mode row, Light when the camera has a
 * torch, the shutter, and "Type it" at the left — which closes the sheet
 * back to the field. The camera has the screen and stays dark in both
 * themes (`keep-dark`). Esc closes it, on this element, not the document.
 *
 * Barcode mode reads codes off the live picture; Photo mode searches with
 * the shutter's photo. `photoOffered` false hides Photo (N07, D25).
 */
export const BarcodeScanner = ({
  mode,
  onModeChange,
  photoOffered,
  onBarcode,
  onPhoto,
  onClose,
}: {
  mode: ScanMode;
  onModeChange: (mode: ScanMode) => void;
  photoOffered: boolean;
  onBarcode: (barcode: Barcode) => void;
  onPhoto: (image: string) => void;
  onClose: () => void;
}) => {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.focus();
  }, []);

  const modes: ScanMode[] = photoOffered ? ["barcode", "photo"] : ["barcode"];

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={TITLES[mode]}
      tabIndex={-1}
      data-search-scan={mode}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onClose();
      }}
      className="keep-dark fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background text-ink outline-none"
    >
      <div className="mx-auto flex w-full max-w-[600px] flex-1 flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <CaptureHeader
          leading={
            <IconButton aria-label="Close" onClick={onClose}>
              <Close />
            </IconButton>
          }
          title={TITLES[mode]}
        />
        <CaptureCamera
          key={mode}
          className="px-0"
          shutterLabel={
            mode === "barcode" ? "Read the barcode" : "Search by this photo"
          }
          onBarcode={mode === "barcode" ? onBarcode : undefined}
          onCapture={onPhoto}
          modeRow={
            modes.length > 1 ? (
              <div
                role="radiogroup"
                aria-label="Scan for"
                className="flex items-center justify-center gap-2"
              >
                {modes.map((value) => (
                  // biome-ignore lint/a11y/useSemanticElements: a segmented mode row, as Capture-Camera's.
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={mode === value}
                    onClick={() => {
                      if (value === mode) return;
                      feedback("tick");
                      onModeChange(value);
                    }}
                    className={cn(
                      "t-head min-h-11 min-w-11 px-3",
                      mode === value ? "text-ink" : "text-ink-2",
                    )}
                  >
                    {value === "barcode" ? "Barcode" : "Photo"}
                  </button>
                ))}
              </div>
            ) : undefined
          }
          leftAction={
            <button
              type="button"
              onClick={() => {
                feedback("tick");
                onClose();
              }}
              className="t-cap flex min-h-11 min-w-11 flex-col items-center justify-center text-ink"
            >
              <span aria-hidden className="t-title leading-none">
                T
              </span>
              Type it
            </button>
          }
        />
      </div>
    </div>
  );
};
