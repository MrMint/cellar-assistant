import {
  type BarcodeFormat,
  prepareZXingModule,
  BarcodeDetector as WasmBarcodeDetector,
} from "barcode-detector/ponyfill";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Barcode, BarcodeType } from "@/constants";
import { createStreamGate, stopStream } from "@/lib/camera/stream-gate";

// Self-hosted zxing-wasm reader, served same-origin so it works under the
// app's strict CSP (connect-src 'self') and offline (PWA). The file is copied
// from node_modules/zxing-wasm/dist/reader/zxing_reader.wasm into
// public/zxing/. Refresh public/zxing/zxing_reader.wasm whenever the
// barcode-detector / zxing-wasm dependency is bumped, together with the
// NOTICE and licence texts beside it (zxing-wasm MIT, zxing-cpp Apache-2.0).
const WASM_URL = "/zxing/zxing_reader.wasm";

// Minimal shape shared by both the native `window.BarcodeDetector` and the
// `barcode-detector/ponyfill` WASM implementation. Their interfaces are
// identical (`new Detector({ formats })`, `detect(image)`), which lets a single
// detection loop drive both code paths.
interface BarcodeDetectorLike {
  detect(
    image: ImageBitmapSource,
  ): Promise<Array<{ rawValue: string; format: string }>>;
}

interface ExtendedMediaTrackCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
}

interface ExtendedMediaTrackConstraintSet extends MediaTrackConstraintSet {
  torch?: boolean;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats?: string[] }): BarcodeDetectorLike;
      getSupportedFormats(): Promise<string[]>;
    };
  }
}

const SUPPORTED_FORMATS: BarcodeFormat[] = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
];

// Map native/ponyfill format names to our BarcodeType enum
const formatMap: Record<string, BarcodeType> = {
  ean_13: BarcodeType.EAN_13,
  ean_8: BarcodeType.EAN_8,
  upc_a: BarcodeType.UPC_A,
  upc_e: BarcodeType.UPC_E,
};

interface UseBarcodeScannerOptions {
  onDetect: (barcode: Barcode) => void;
  constraints?: MediaStreamConstraints;
  /**
   * X05's one camera: a read pauses detection but keeps the stream, so the
   * same viewfinder goes on to photograph the label. The default (`false`)
   * is the scanner's old behaviour — the stream stops on the first read.
   */
  keepStream?: boolean;
  /**
   * Where to look: the old centre band (`"band"`, the barcode step and
   * search, which draw a frame there), or the whole picture (`"full"`, the
   * capture camera, where the barcode is wherever the bottle's back is).
   */
  region?: "band" | "full";
  /**
   * Run detection at most this often. A full 1080p frame through the WASM
   * reader every animation frame is wasted battery on a phone; the capture
   * camera asks every ~250 ms. `0` (the default): every frame, as before.
   */
  intervalMs?: number;
  /** `false`: the stream runs but nothing is decoded (no barcode wanted). */
  detect?: boolean;
}

interface UseBarcodeScannerReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isSupported: boolean;
  isStreaming: boolean;
  error: string | null;
  /** The `getUserMedia` failure itself (its `name` says why) — N04. */
  failure: unknown;
  startScanning: () => Promise<void>;
  stopScanning: () => void;
  toggleTorch: () => Promise<void>;
  torchSupported: boolean;
  torchEnabled: boolean;
  usingNativeAPI: boolean;
  /**
   * The current frame as a JPEG data URL, at the stream's full size — the
   * capture camera's shutter. `null` before the video has a frame.
   */
  captureFrame: () => string | null;
  /** After a `keepStream` read: look for a barcode again. */
  resumeDetection: () => void;
}

export const useBarcodeScanner = ({
  onDetect,
  constraints = {
    video: {
      width: 1920,
      height: 1080,
      facingMode: "environment",
    },
  },
  keepStream = false,
  region = "band",
  intervalMs = 0,
  detect = true,
}: UseBarcodeScannerOptions): UseBarcodeScannerReturn => {
  // State
  const [isReady, setIsReady] = useState(false);
  const [usingNativeAPI, setUsingNativeAPI] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);

  // Refs
  const isInitializedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const canvasRef = useRef<HTMLCanvasElement | undefined>(undefined);
  const detectBarcodesRef = useRef<(() => void) | undefined>(undefined);
  const detectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  // A `keepStream` read pauses the loop without stopping the stream.
  const pausedRef = useRef(false);
  // Read when the stream starts, which is not a render.
  const detectRef = useRef(detect);
  detectRef.current = detect;
  // Which getUserMedia request is still wanted: a stream that answers after
  // Try again or Skip is stopped instead of adopted (`stream-gate.ts`).
  const gateRef = useRef(createStreamGate());

  // Select the detector once on mount: native `BarcodeDetector` first (fast,
  // OS-accelerated, zero-download on Chrome/Edge/Android), the WASM ponyfill as
  // a universal fallback (iOS Safari, Firefox).
  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      let nativeFormats: string[] | null = null;

      if ("BarcodeDetector" in window && window.BarcodeDetector) {
        try {
          const supported = await window.BarcodeDetector.getSupportedFormats();
          const usable = SUPPORTED_FORMATS.filter((format) =>
            supported.includes(format),
          );
          if (usable.length > 0) {
            nativeFormats = usable;
          }
        } catch {
          nativeFormats = null;
        }
      }

      if (cancelled) return;

      if (nativeFormats && window.BarcodeDetector) {
        detectorRef.current = new window.BarcodeDetector({
          formats: nativeFormats,
        });
        setUsingNativeAPI(true);
      } else {
        // WASM fallback. Point the ponyfill at the self-hosted reader.
        // `fireImmediately: false` only registers the override — the ~1MB WASM
        // binary is not fetched until the first detect() call, so native users
        // (where this branch never runs) never download it.
        prepareZXingModule({
          overrides: {
            locateFile: (path: string, prefix: string) =>
              path.endsWith(".wasm") ? WASM_URL : prefix + path,
          },
          fireImmediately: false,
        });
        detectorRef.current = new WasmBarcodeDetector({
          formats: SUPPORTED_FORMATS,
        });
        setUsingNativeAPI(false);
      }

      canvasRef.current = document.createElement("canvas");
      setIsReady(true);
    };

    setup();

    return () => {
      cancelled = true;
    };
  }, []);

  // Stop scanning function
  const stopScanning = useCallback(() => {
    // Voids a request still pending, so its stream is stopped on arrival.
    gateRef.current.cancel();

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    clearTimeout(detectTimerRef.current);

    if (streamRef.current) {
      stopStream(streamRef.current);
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsStreaming(false);
    setTorchEnabled(false);
    isInitializedRef.current = false; // Reset initialization state when stopping
  }, []);

  /** The next pass: the next frame, or after `intervalMs` when throttled. */
  const scheduleNext = useCallback(() => {
    const next = () => {
      animationFrameRef.current = requestAnimationFrame(() =>
        detectBarcodesRef.current?.(),
      );
    };
    if (intervalMs > 0) {
      detectTimerRef.current = setTimeout(next, intervalMs);
    } else {
      next();
    }
  }, [intervalMs]);

  // Barcode detection loop (drives both native and WASM detectors)
  const detectBarcodes = useCallback(async () => {
    if (!videoRef.current || !detectorRef.current || !canvasRef.current) {
      return;
    }
    if (pausedRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx || video.readyState !== 4) {
      animationFrameRef.current = requestAnimationFrame(() =>
        detectBarcodesRef.current?.(),
      );
      return;
    }

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Focus detection on the center region — or, for the capture camera,
    // the whole frame.
    const full = region === "full";
    const centerX = full ? 0 : canvas.width * 0.15;
    const centerY = full ? 0 : canvas.height * 0.35;
    const regionWidth = full ? canvas.width : canvas.width * 0.7;
    const regionHeight = full ? canvas.height : canvas.height * 0.3;

    // Create a smaller canvas for the detection region
    const regionCanvas = document.createElement("canvas");
    regionCanvas.width = regionWidth;
    regionCanvas.height = regionHeight;
    const regionCtx = regionCanvas.getContext("2d");

    if (!regionCtx) {
      animationFrameRef.current = requestAnimationFrame(() =>
        detectBarcodesRef.current?.(),
      );
      return;
    }

    // Draw the focused region
    regionCtx.drawImage(
      canvas,
      centerX,
      centerY,
      regionWidth,
      regionHeight,
      0,
      0,
      regionWidth,
      regionHeight,
    );

    try {
      const barcodes = await detectorRef.current.detect(regionCanvas);

      if (barcodes.length > 0) {
        const detectedBarcode = barcodes[0];
        const barcodeType = formatMap[detectedBarcode.format];

        // Stopped (or paused) while this frame was being decoded: the read
        // belongs to nobody now.
        if (pausedRef.current) return;

        onDetect({
          text: detectedBarcode.rawValue,
          type: barcodeType,
        });

        if (keepStream) {
          // X05: the viewfinder stays live for the label photo.
          pausedRef.current = true;
        } else {
          // Stop scanning after successful detection
          stopScanning();
        }
        return;
      }
    } catch (_err) {
      // Silently continue on detection errors
    }

    // Continue scanning
    scheduleNext();
  }, [onDetect, stopScanning, keepStream, region, scheduleNext]);

  // Update the ref with the latest detectBarcodes function
  detectBarcodesRef.current = detectBarcodes;

  // Memoize constraints to prevent re-initialization
  const stableConstraints = useMemo(() => constraints, [constraints]);

  // Start scanning function
  const startScanning = useCallback(async () => {
    if (!detectorRef.current || isInitializedRef.current) return; // Wait for detector and prevent double init

    const gate = gateRef.current;
    const ticket = gate.begin();
    try {
      setError(null);
      setFailure(null);
      isInitializedRef.current = true;

      const stream =
        await navigator.mediaDevices.getUserMedia(stableConstraints);
      // Stopped (Skip, unmount) or superseded (Try again) while the camera
      // was being asked: this stream is nobody's, so it is stopped here.
      if (!gate.adopt(ticket, stream)) return;
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise<void>((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
              videoRef.current?.play();
              resolve();
            };
          } else {
            resolve();
          }
        });

        // Stopped while the video was loading: `stopScanning` has already
        // stopped this stream's tracks; do not start detecting on it.
        if (!gate.isCurrent(ticket)) return;

        setIsStreaming(true);

        // Check for torch support
        const videoTrack = stream.getVideoTracks()[0];
        const capabilities = videoTrack.getCapabilities?.() as
          | ExtendedMediaTrackCapabilities
          | undefined;
        setTorchSupported(!!capabilities?.torch);

        // Start barcode detection
        pausedRef.current = !detectRef.current;
        detectBarcodesRef.current?.();
      }
    } catch (err) {
      // A refusal for a request nobody wants any more says nothing now.
      if (!gate.isCurrent(ticket)) return;
      setError(err instanceof Error ? err.message : "Failed to start camera");
      setFailure(err ?? new Error("Failed to start camera"));
      setIsStreaming(false);
      isInitializedRef.current = false; // Reset initialization state on error
    }
  }, [stableConstraints]);

  // Toggle torch function (handled via MediaStream track constraints for both
  // detector backends, since this hook now owns getUserMedia in all cases)
  const toggleTorch = useCallback(async () => {
    if (!streamRef.current || !torchSupported) return;

    try {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      const newTorchState = !torchEnabled;

      await videoTrack.applyConstraints({
        advanced: [{ torch: newTorchState } as ExtendedMediaTrackConstraintSet],
      });

      setTorchEnabled(newTorchState);
    } catch (err) {
      console.warn("Failed to toggle torch:", err);
    }
  }, [torchSupported, torchEnabled]);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (video === null || video.videoWidth === 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.92);
  }, []);

  const resumeDetection = useCallback(() => {
    if (!pausedRef.current || streamRef.current === null) return;
    pausedRef.current = false;
    detectBarcodesRef.current?.();
  }, []);

  // `detect` switched on a running stream (a barcode cleared, a mode
  // changed): look again; switched off: stop looking, keep the picture.
  useEffect(() => {
    if (detect) resumeDetection();
    else pausedRef.current = true;
  }, [detect, resumeDetection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, [stopScanning]);

  return {
    videoRef,
    isSupported: isReady,
    isStreaming,
    error,
    failure,
    startScanning,
    stopScanning,
    toggleTorch,
    torchSupported,
    torchEnabled,
    usingNativeAPI,
    captureFrame,
    resumeDetection,
  };
};
