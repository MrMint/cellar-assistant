"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import { IconButton } from "@/components/app/IconButton";
import { Camera, Idea, PhotoLibrary } from "@/components/app/icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useCameraStatus } from "@/hooks/useCameraStatus";
import {
  CAMERA_CAPTURE_CONSTRAINTS,
  cameraKeepsListening,
} from "@/lib/camera/camera-status";
import { libraryImageToDataUrl } from "@/lib/camera/library-image";
import { cn } from "@/lib/utils";

// N04: every constraint is `ideal` (`CAMERA_CAPTURE_CONSTRAINTS`). The old
// `min: 1080` made getUserMedia refuse outright on cameras that could not meet
// it, and the non-standard focus/exposure/white-balance modes are gone with it.

export const CameraCapture = ({
  onCapture,
  showLibrary = true,
}: {
  onCapture: (image: string) => void;
  /**
   * The library button beside the shutter. Hosts with their own full-size
   * picker under the viewfinder (AddPhoto, MenuScanner) turn it off; the
   * failure panel offers the library either way, so nobody is stranded.
   */
  showLibrary?: boolean;
}) => {
  const webcamRef = useRef<Webcam | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const libraryRef = useRef<HTMLInputElement | null>(null);
  const camera = useCameraStatus();
  const isVideoLoaded = camera.status.kind === "ready";
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [showFocusIndicator, setShowFocusIndicator] = useState(false);

  // Check for torch support when video loads
  const { onStream } = camera;
  const handleUserMedia = useCallback(
    (stream: MediaStream) => {
      streamRef.current = stream;
      onStream();

      // Check for torch capability
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities = videoTrack.getCapabilities?.();
        setTorchSupported(
          !!(capabilities as MediaTrackCapabilities & { torch?: boolean })
            ?.torch,
        );
      }
    },
    [onStream],
  );

  // N04: "Choose from library" — a picked photo is handed on exactly like a
  // capture, so a camera that never starts is not the end of the flow.
  const handleLibraryPick = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file === undefined) return;
      setLibraryError(null);
      try {
        onCapture(await libraryImageToDataUrl(file));
      } catch (cause) {
        setLibraryError(
          cause instanceof Error
            ? cause.message
            : "The photo could not be read.",
        );
      }
    },
    [onCapture],
  );
  const openLibrary = useCallback(() => libraryRef.current?.click(), []);

  // Toggle torch/flashlight
  const toggleTorch = useCallback(async () => {
    if (!streamRef.current || !torchSupported) return;

    try {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      const newTorchState = !torchEnabled;

      await videoTrack.applyConstraints({
        advanced: [
          { torch: newTorchState } as MediaTrackConstraintSet & {
            torch?: boolean;
          },
        ],
      });

      setTorchEnabled(newTorchState);
    } catch (err) {
      console.warn("Failed to toggle torch:", err);
    }
  }, [torchEnabled, torchSupported]);

  // Tap to focus functionality
  const handleTapToFocus = useCallback(
    async (event: React.MouseEvent<HTMLDivElement>) => {
      if (!streamRef.current) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Convert to normalized coordinates (0-1)
      const normalizedX = x / rect.width;
      const normalizedY = y / rect.height;

      setFocusPoint({ x, y });
      setShowFocusIndicator(true);

      try {
        const videoTrack = streamRef.current.getVideoTracks()[0];

        // Apply focus constraints
        await videoTrack.applyConstraints({
          advanced: [
            {
              focusMode: "manual",
              focusDistance: { ideal: 0.5 }, // Adjust based on distance estimation
              pointsOfInterest: [{ x: normalizedX, y: normalizedY }],
            } as MediaTrackConstraintSet & {
              focusMode?: string;
              focusDistance?: { ideal: number };
              pointsOfInterest?: Array<{ x: number; y: number }>;
            },
          ],
        });

        // Hide focus indicator after a delay
        setTimeout(() => {
          setShowFocusIndicator(false);
          // Return to continuous focus after manual focus
          videoTrack
            .applyConstraints({
              advanced: [
                { focusMode: "continuous" } as MediaTrackConstraintSet & {
                  focusMode?: string;
                },
              ],
            })
            .catch(() => {});
        }, 2000);
      } catch (err) {
        console.warn("Failed to focus:", err);
        setShowFocusIndicator(false);
      }
    },
    [],
  );

  // Enhanced capture with quality optimization
  const capture = useCallback(async () => {
    if (webcamRef.current === null || isCapturing) return;

    setIsCapturing(true);

    try {
      // Small delay to ensure camera stability
      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = webcamRef.current.getScreenshot({
        width: 1920,
        height: 1920, // Square screenshot
      });

      if (result != null) {
        onCapture(result);
      }
    } finally {
      setIsCapturing(false);
    }
  }, [onCapture, isCapturing]);

  // Cleanup torch when component unmounts
  useEffect(() => {
    return () => {
      if (streamRef.current && torchEnabled) {
        const videoTrack = streamRef.current.getVideoTracks()[0];
        videoTrack
          ?.applyConstraints({
            advanced: [
              { torch: false } as MediaTrackConstraintSet & {
                torch?: boolean;
              },
            ],
          })
          .catch(() => {});
      }
    };
  }, [torchEnabled]);

  const failed = camera.status.kind === "failed" ? camera.status : null;

  return (
    <div
      data-slot="camera-capture"
      className="relative aspect-square max-h-[600px] w-full overflow-hidden rounded-lg bg-surface-2"
    >
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleLibraryPick}
      />
      {camera.status.kind === "starting" && (
        <div className="absolute inset-0 flex items-center justify-center">
          {/* `progressbar`, as Joy's CircularProgress was: the mobile e2e
              (m02-camera-fallback) proves the spinner is gone by that role. */}
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
            <Button variant="outline" onClick={camera.retry}>
              Try again
            </Button>
          </div>
        </div>
      )}
      <div className="absolute inset-0">
        {/* A timed-out camera stays mounted under its message, so a late
            "Allow" still lands (`cameraKeepsListening`). */}
        {cameraKeepsListening(camera.status) && (
          <Webcam
            key={camera.attempt}
            ref={webcamRef}
            audio={false}
            forceScreenshotSourceSize={true}
            screenshotQuality={1}
            screenshotFormat="image/jpeg"
            videoConstraints={CAMERA_CAPTURE_CONSTRAINTS}
            onUserMedia={handleUserMedia}
            onUserMediaError={camera.onError}
            className="size-full object-cover"
          />
        )}
        {isVideoLoaded && (
          // Tap to focus is a pointer gesture on the picture itself; the
          // shutter and the library are the keyboard's controls.
          // biome-ignore lint/a11y/noStaticElementInteractions: see above.
          // biome-ignore lint/a11y/useKeyWithClickEvents: see above.
          <div
            className="absolute inset-0 cursor-crosshair"
            onClick={handleTapToFocus}
          />
        )}
        {focusPoint && (
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute size-[50px] rounded-full border-2 border-white/80",
              "transition-[opacity,scale] duration-(--ca-dur-medium) ease-standard",
              "before:absolute before:top-1/2 before:left-1/2 before:h-5 before:w-0.5 before:-translate-1/2 before:bg-white/80 before:content-['']",
              "after:absolute after:top-1/2 after:left-1/2 after:h-0.5 after:w-5 after:-translate-1/2 after:bg-white/80 after:content-['']",
              showFocusIndicator
                ? "scale-100 opacity-100"
                : "scale-150 opacity-0",
            )}
            // The tap's position, known only at runtime.
            style={{ left: focusPoint.x - 25, top: focusPoint.y - 25 }}
          />
        )}
        {failed === null && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/30 p-4 backdrop-blur-xs">
            {/* Torch control, or a spacer that keeps the shutter centred */}
            {torchSupported ? (
              // The label names the action, as BarcodeScanner's torch does, so
              // no `aria-pressed`: "Turn off light, pressed" reads as a
              // contradiction.
              <IconButton
                aria-label={torchEnabled ? "Turn off light" : "Turn on light"}
                onClick={toggleTorch}
                variant="outline"
                className={cn(
                  torchEnabled &&
                    "bg-ink-1 text-background hover:bg-ink-1/90 hover:text-background dark:bg-ink-1 dark:hover:bg-ink-1/90",
                )}
              >
                <Idea className={cn(torchEnabled && "fill-current")} />
              </IconButton>
            ) : (
              <div className="size-11" />
            )}

            {/* Capture button */}
            <IconButton
              aria-label="Take photo"
              onClick={capture}
              size="lg"
              variant="default"
              disabled={isCapturing || !isVideoLoaded}
              className={cn(isCapturing && "scale-95")}
            >
              <Camera />
            </IconButton>

            {/* N04: the photo library, beside the shutter */}
            {showLibrary ? (
              <IconButton
                aria-label="Choose from library"
                onClick={openLibrary}
                variant="outline"
              >
                <PhotoLibrary />
              </IconButton>
            ) : (
              <div className="size-11" />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
