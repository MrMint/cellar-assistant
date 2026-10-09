"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Barcode } from "@/constants";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useCameraStatus } from "@/hooks/useCameraStatus";
import { BARCODE_SCAN_CONSTRAINTS } from "@/lib/camera/camera-status";
import { cn } from "@/lib/utils";

type BarcodeScannerProps = {
  onChange: (result: Barcode) => void;
  /**
   * What to do instead when the camera can't be used, after the reason (N04).
   * Search says its own; the default is generic.
   */
  cameraFallbackHint?: string;
};

// The add flow reads barcodes off its one camera now (X05), so search is the
// one host left, and it passes its own words.
const FALLBACK_HINT = "Type the code in instead.";

// N04: `ideal`-only constraints (`BARCODE_SCAN_CONSTRAINTS`); the old
// `min: 640 × 480` could make getUserMedia refuse outright.
const videoConstraints: MediaStreamConstraints = BARCODE_SCAN_CONSTRAINTS;

export const BarcodeScanner = ({
  onChange,
  cameraFallbackHint = FALLBACK_HINT,
}: BarcodeScannerProps) => {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const camera = useCameraStatus();
  const [detectionSuccess, setDetectionSuccess] = useState(false);

  // Handle detection with visual feedback
  const handleDetection = useCallback(
    (barcode: Barcode) => {
      setDetectionSuccess(true);
      onChange(barcode);

      // Reset success state after animation
      setTimeout(() => setDetectionSuccess(false), 1000);
    },
    [onChange],
  );

  // Use unified barcode scanner hook
  const {
    videoRef,
    isSupported,
    error,
    failure,
    startScanning,
    stopScanning,
    toggleTorch,
    torchSupported,
    torchEnabled,
  } = useBarcodeScanner({
    onDetect: handleDetection,
    constraints: videoConstraints,
  });

  // Start scanning when component mounts and hook is ready
  useEffect(() => {
    if (isSupported) {
      startScanning();
      return () => stopScanning();
    }
  }, [isSupported, startScanning, stopScanning]); // Only depend on isSupported

  // N04: a camera that refuses, or never answers, says so — the step's Skip
  // button is the way on, and "Try again" asks for the stream afresh.
  const { onError, onStream, retry } = camera;
  useEffect(() => {
    if (failure !== null) onError(failure);
  }, [failure, onError]);

  const handleVideoLoad = () => {
    setIsVideoLoaded(true);
    onStream();
  };

  const handleRetry = () => {
    retry();
    stopScanning();
    void startScanning();
  };

  const failed = camera.status.kind === "failed" ? camera.status : null;

  return (
    <div
      data-slot="barcode-scanner"
      className="relative aspect-[16/10] w-full overflow-hidden rounded-lg bg-surface-2"
    >
      {!isVideoLoaded && failed === null && (
        <div className="absolute inset-0 flex items-center justify-center">
          {/* `progressbar`, as Joy's CircularProgress was (see CameraCapture). */}
          <Spinner
            role="progressbar"
            aria-label="Starting the camera"
            className="size-8 text-ink-2"
          />
        </div>
      )}
      {failed !== null && !isVideoLoaded && (
        <div
          role="alert"
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-surface-2 p-6 text-center"
        >
          <p className="type-body">
            {failed.reason === "timeout"
              ? "The camera is taking too long to start."
              : "The barcode scanner can't use the camera."}{" "}
            {cameraFallbackHint}
          </p>
          <Button variant="outline" onClick={handleRetry}>
            Try again
          </Button>
        </div>
      )}
      <video
        ref={videoRef}
        onLoadedData={handleVideoLoad}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 size-full object-cover object-center"
      />

      {/* Detection overlay to show scanning area */}
      {isVideoLoaded && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={cn(
              "relative flex h-[30%] w-[70%] items-center justify-center rounded-sm transition-colors duration-(--ca-dur-medium) ease-standard",
              detectionSuccess
                ? "border-3 border-success bg-success/20"
                : "border-2 border-white/80 bg-white/10",
            )}
          >
            {/* The frame's outer ring: a slow pulse while it looks, a flash
                on a read (replayed by its key). */}
            <span
              key={detectionSuccess ? "hit" : "looking"}
              aria-hidden
              className={cn(
                "absolute -inset-[3px] rounded-sm",
                detectionSuccess
                  ? "fade-in-0 zoom-in-95 animate-in border-3 border-success duration-(--ca-dur-long)"
                  : "animate-pulse border-2 border-success/60 motion-reduce:animate-none motion-reduce:opacity-0",
              )}
            />
            <p className="text-center font-medium text-sm text-white/90 text-shadow-black/80 text-shadow-sm">
              {detectionSuccess
                ? "Barcode detected!"
                : "Position barcode within this frame"}
            </p>
          </div>
        </div>
      )}

      {isVideoLoaded && (
        <div className="relative z-10 flex flex-col items-start gap-2 p-4">
          {torchSupported && (
            <Button onClick={toggleTorch}>
              {torchEnabled ? "Turn off light" : "Turn on light"}
            </Button>
          )}
          {error && <p className="type-callout text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
};
