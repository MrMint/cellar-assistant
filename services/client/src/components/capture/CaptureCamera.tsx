"use client";

import { useReducedMotion } from "motion/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { IconButton } from "@/components/app/IconButton";
import {
  Barcode as BarcodeGlyph,
  Check,
  Idea,
  PhotoLibrary,
} from "@/components/app/icons";
import { BackgroundPill } from "@/components/drafts/background/BackgroundPill";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Barcode } from "@/constants";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useCameraStatus } from "@/hooks/useCameraStatus";
import { libraryImageToDataUrl } from "@/lib/camera/library-image";
import { feedback } from "@/lib/feedback";
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
  overlay?: ReactNode;
  /**
   * Capture-Camera 01: the mode row (Bottle · Menu · Recipe) under the
   * picture. "Light" sits at its end when the camera has a torch; a mode
   * change remounts the camera, so the light goes off with it.
   */
  modeRow?: ReactNode;
  /** Left of the shutter: "Type it" (the typed entry). */
  leftAction?: ReactNode;
  /** Right of the shutter, in place of the library: the tray's "Done". */
  rightAction?: ReactNode;
  /** CC-1: the shutter dims while a card over the camera asks something. */
  dimShutter?: boolean;
  /** Mount K2's background-work pill in the viewfinder (L50). */
  showBackground?: boolean;
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
  modeRow,
  leftAction,
  rightAction,
  dimShutter = false,
  showBackground = false,
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
    feedback("medium");
    if (!reduceMotion) setFlash((n) => n + 1);
    onCapture(image);
  };

  const openLibrary = () => {
    feedback("press");
    libraryRef.current?.click();
  };
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
  const glassChip =
    "inline-flex h-7 items-center gap-1.5 rounded-full bg-glass px-3 t-cap font-semibold text-on-glass";

  return (
    // The camera is one dark place in both themes (LIGHT-capture ruling 1):
    // `.keep-dark` puts the dark tokens on everything inside it.
    <div
      data-slot="capture-camera"
      className={cn("keep-dark flex flex-col bg-bg text-ink", className)}
    >
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleLibraryPick}
      />
      <div
        data-slot="viewfinder"
        className="relative aspect-[3/4] max-h-[64dvh] w-full overflow-hidden bg-raised md:rounded-lg"
      >
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Spinner
              role="progressbar"
              aria-label="Starting the camera"
              className="size-8 text-ink-2"
            />
            <p className="t-cap text-ink-2">Starting the camera</p>
          </div>
        )}

        {failed !== null && (
          <div
            role="alert"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-raised p-6 text-center"
          >
            <p className="t-head text-ink">{failed.message}</p>
            {libraryError !== null && (
              <p className="t-cap text-danger">{libraryError}</p>
            )}
            <div className="flex flex-row flex-wrap justify-center gap-2">
              <Button onClick={openLibrary}>
                <PhotoLibrary aria-hidden />
                Choose a photo
              </Button>
              <Button variant="outline" onClick={handleRetry}>
                Try again
              </Button>
            </div>
          </div>
        )}

        {live && (
          <>
            {/* Where the label goes: four corner brackets. Decorative — the
                read takes the whole picture, and a barcode is found
                anywhere in it. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-[8%] inset-y-[5%]"
            >
              <span className="absolute top-0 left-0 size-7 rounded-tl-md border-on-glass border-t-[3px] border-l-[3px]" />
              <span className="absolute top-0 right-0 size-7 rounded-tr-md border-on-glass border-t-[3px] border-r-[3px]" />
              <span className="absolute bottom-0 left-0 size-7 rounded-bl-md border-on-glass border-b-[3px] border-l-[3px]" />
              <span className="absolute right-0 bottom-0 size-7 rounded-br-md border-on-glass border-r-[3px] border-b-[3px]" />
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-start gap-2 p-3">
              {(onBarcode !== undefined || barcode !== undefined) && (
                <p role="status" className={glassChip}>
                  {barcode === undefined ? (
                    <>
                      <BarcodeGlyph aria-hidden className="size-4" />
                      Looking for a barcode
                    </>
                  ) : (
                    <>
                      <Check aria-hidden className="size-4 text-act-on-glass" />
                      Barcode {barcode.text}
                    </>
                  )}
                </p>
              )}
              {overlay}
            </div>
          </>
        )}

        {showBackground && (
          <div className="absolute top-3 right-3 z-20">
            <BackgroundPill />
          </div>
        )}

        {flash > 0 && (
          <div
            key={flash}
            aria-hidden
            className="fade-out-0 pointer-events-none absolute inset-0 animate-out fill-mode-forwards bg-white duration-(--ca-dur-medium)"
          />
        )}

        {libraryError !== null && failed === null && (
          <p
            role="alert"
            className="absolute inset-x-3 bottom-3 rounded-md bg-glass p-2 text-center t-cap text-on-glass"
          >
            {libraryError}
          </p>
        )}
      </div>

      {(modeRow !== undefined || (torchSupported && failed === null)) && (
        <div className="flex min-h-14 items-center gap-2 px-2 pt-2">
          <div className="min-w-0 flex-1">{modeRow}</div>
          {torchSupported && failed === null && (
            <button
              type="button"
              aria-pressed={torchEnabled}
              onClick={() => {
                feedback("toggle");
                toggleTorch();
              }}
              className={cn(
                "flex h-11 min-w-14 shrink-0 flex-col items-center justify-center rounded-lg border border-edge px-2 text-ink-2 outline-none transition-transform duration-(--ca-dur-micro) focus-visible:outline-2 focus-visible:outline-act-ink active:scale-97 motion-reduce:active:scale-100",
                torchEnabled && "border-edge-2 bg-sel text-ink",
              )}
            >
              <Idea
                aria-hidden
                className={cn("size-4", torchEnabled && "fill-current")}
              />
              <span className="t-micro">Light</span>
            </button>
          )}
        </div>
      )}

      {/* "Type it" stays live in every camera state (Capture-Camera). */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 pt-3 pb-4">
        <div className="flex justify-start">{leftAction}</div>
        {failed !== null ? (
          <div className="size-[76px]" />
        ) : (
          <button
            type="button"
            aria-label={shutterLabel}
            onClick={shoot}
            disabled={!live}
            data-slot="shutter"
            className={cn(
              "flex size-[76px] items-center justify-center rounded-full border-4 border-ink outline-none transition-[transform,opacity] duration-(--ca-dur-micro) ease-standard focus-visible:outline-2 focus-visible:outline-act-ink focus-visible:outline-offset-2 active:scale-95 disabled:opacity-40 motion-reduce:active:scale-100",
              dimShutter && "opacity-40",
            )}
          >
            <span className="size-[60px] rounded-full bg-act" />
          </button>
        )}
        <div className="flex justify-end">
          {rightAction}
          {rightAction === undefined && failed === null && (
            <IconButton
              aria-label="Choose a photo"
              onClick={openLibrary}
              variant="ghost"
              className="text-ink"
            >
              <PhotoLibrary />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );
}
