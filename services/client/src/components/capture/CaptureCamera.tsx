"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/app/IconButton";
import {
  Barcode as BarcodeGlyph,
  Check,
  Idea,
  PhotoLibrary,
} from "@/components/app/icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Barcode } from "@/constants";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useCameraStatus } from "@/hooks/useCameraStatus";
import { libraryImageToDataUrl } from "@/lib/camera/library-image";
import { cn } from "@/lib/utils";

/**
 * The label camera: back-facing and as large as it will go — every value
 * `ideal`, never `min`/`exact` (N04: a hard constraint is a refusal on the
 * cameras that cannot meet it).
 */
export const CAPTURE_STREAM_CONSTRAINTS = {
  video: {
    width: { ideal: 1920 },
    height: { ideal: 1920 },
    facingMode: { ideal: "environment" },
  },
} as const satisfies MediaStreamConstraints;

/** How often the live barcode reader looks at the frame (ms). */
const BARCODE_INTERVAL_MS = 250;

export type CaptureCameraProps = {
  /** The shutter, or a photo picked from the library: a JPEG data URL. */
  onCapture: (image: string) => void;
  /**
   * X05: a barcode read off the live picture, before the shutter. Omit to
   * run the camera without the reader (the back-label retake).
   */
  onBarcode?: (barcode: Barcode) => void;
  /** The code already read, shown as a chip on the picture. */
  barcode?: Barcode;
  /** What the shutter is for, for its accessible name. */
  shutterLabel?: string;
  /** Overlaid at the top of the picture, under the barcode chip. */
  overlay?: React.ReactNode;
  className?: string;
};

/**
 * **One camera** (X05): the live picture reads a barcode while you frame the
 * label, and the shutter photographs the label from the same stream — no
 * second camera, no step between them. Library on the left and torch on the
 * right of a bottom-centre shutter (design §2). It never dead-ends (N04): a
 * camera that refuses or never answers says so, with the library and "Try
 * again".
 */
export function CaptureCamera({
  onCapture,
  onBarcode,
  barcode,
  shutterLabel = "Take photo",
  overlay,
  className,
}: CaptureCameraProps) {
  const camera = useCameraStatus();
  const reduceMotion = useReducedMotion();
  const libraryRef = useRef<HTMLInputElement | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [flash, setFlash] = useState(0);
  const [videoReady, setVideoReady] = useState(false);

  const handleDetect = useCallback(
    (code: Barcode) => onBarcode?.(code),
    [onBarcode],
  );

  const {
    videoRef,
    isSupported,
    failure,
    startScanning,
    stopScanning,
    toggleTorch,
    torchSupported,
    torchEnabled,
    captureFrame,
  } = useBarcodeScanner({
    onDetect: handleDetect,
    constraints: CAPTURE_STREAM_CONSTRAINTS,
    keepStream: true,
    region: "full",
    intervalMs: BARCODE_INTERVAL_MS,
    // Stop looking once a code is in hand; a cleared code looks again.
    detect: onBarcode !== undefined && barcode === undefined,
  });

  useEffect(() => {
    if (!isSupported) return;
    void startScanning();
    return () => stopScanning();
  }, [isSupported, startScanning, stopScanning]);

  const { onError, onStream, retry } = camera;
  useEffect(() => {
    if (failure !== null) onError(failure);
  }, [failure, onError]);

  const handleRetry = () => {
    retry();
    stopScanning();
    void startScanning();
  };

  const shoot = () => {
    const image = captureFrame();
    if (image === null) return;
    if (!reduceMotion) setFlash((n) => n + 1);
    onCapture(image);
  };

  const openLibrary = () => libraryRef.current?.click();
  const handleLibraryPick = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    setLibraryError(null);
    try {
      onCapture(await libraryImageToDataUrl(file));
    } catch (cause) {
      setLibraryError(
        cause instanceof Error ? cause.message : "The photo could not be read.",
      );
    }
  };

  const failed = camera.status.kind === "failed" ? camera.status : null;
  const live = videoReady && failed === null;

  return (
    <div
      data-slot="capture-camera"
      className={cn(
        "relative aspect-[3/4] max-h-[64dvh] w-full overflow-hidden rounded-lg bg-surface-2",
        className,
      )}
    >
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleLibraryPick}
      />
      <video
        ref={videoRef}
        onLoadedData={() => {
          setVideoReady(true);
          onStream();
        }}
        autoPlay
        playsInline
        muted
        aria-hidden
        className="absolute inset-0 size-full object-cover"
      />

      {!videoReady && failed === null && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner
            role="progressbar"
            aria-label="Starting the camera"
            className="size-8 text-ink-2"
          />
        </div>
      )}

      {failed !== null && (
        <div
          role="alert"
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-surface-2 p-6 text-center"
        >
          <p className="type-body">{failed.message}</p>
          {libraryError !== null && (
            <p className="type-callout text-destructive">{libraryError}</p>
          )}
          <div className="flex flex-row flex-wrap justify-center gap-2">
            <Button onClick={openLibrary}>
              <PhotoLibrary aria-hidden />
              Choose from library
            </Button>
            <Button variant="outline" onClick={handleRetry}>
              Try again
            </Button>
          </div>
        </div>
      )}

      {live && (
        <>
          {/* Where the label goes. Decorative: the read takes the whole
              picture, and the barcode is found anywhere in it. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-[12%] inset-y-[14%] rounded-md border-2 border-white/45"
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-start gap-2 bg-gradient-to-b from-black/45 to-transparent p-3 pb-8">
            {(onBarcode !== undefined || barcode !== undefined) && (
              <p
                role="status"
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full px-3 font-medium text-[13px] backdrop-blur-sm",
                  barcode === undefined
                    ? "bg-black/40 text-white/85"
                    : "bg-success/20 text-success",
                )}
              >
                {barcode === undefined ? (
                  <>
                    <BarcodeGlyph aria-hidden className="size-4" />
                    Looking for a barcode
                  </>
                ) : (
                  <>
                    <Check aria-hidden className="size-4" />
                    Barcode {barcode.text}
                  </>
                )}
              </p>
            )}
            {overlay}
          </div>
        </>
      )}

      {flash > 0 && (
        <div
          key={flash}
          aria-hidden
          className="fade-out-0 pointer-events-none absolute inset-0 animate-out fill-mode-forwards bg-white duration-(--ca-dur-medium)"
        />
      )}

      {failed === null && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/55 to-transparent px-6 pt-10 pb-5">
          <IconButton
            aria-label="Choose from library"
            onClick={openLibrary}
            variant="outline"
            className="border-white/40 bg-black/30 text-white backdrop-blur-sm hover:bg-black/40 hover:text-white"
          >
            <PhotoLibrary />
          </IconButton>
          <button
            type="button"
            aria-label={shutterLabel}
            onClick={shoot}
            disabled={!live}
            data-slot="shutter"
            className="flex size-[72px] items-center justify-center rounded-full border-4 border-white/90 outline-none transition-transform duration-(--ca-dur-micro) ease-standard focus-visible:ring-[3px] focus-visible:ring-ring/60 active:scale-95 disabled:opacity-50 motion-reduce:active:scale-100"
          >
            <span className="size-14 rounded-full bg-primary" />
          </button>
          {torchSupported ? (
            <IconButton
              aria-label={torchEnabled ? "Turn off light" : "Turn on light"}
              onClick={toggleTorch}
              variant="outline"
              className={cn(
                "border-white/40 bg-black/30 text-white backdrop-blur-sm hover:bg-black/40 hover:text-white",
                torchEnabled && "bg-white text-black hover:bg-white/90",
              )}
            >
              <Idea className={cn(torchEnabled && "fill-current")} />
            </IconButton>
          ) : (
            <div className="size-11" />
          )}
        </div>
      )}
      {libraryError !== null && failed === null && (
        <p
          role="alert"
          className="absolute inset-x-3 bottom-28 rounded-md bg-black/60 p-2 text-center type-callout text-destructive"
        >
          {libraryError}
        </p>
      )}
    </div>
  );
}
