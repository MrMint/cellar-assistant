import {
  type BarcodeFormat,
  prepareZXingModule,
  BarcodeDetector as WasmBarcodeDetector,
} from "barcode-detector/ponyfill";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Barcode, BarcodeType } from "@/constants";

// Self-hosted zxing-wasm reader, served same-origin so it works under the
// app's strict CSP (connect-src 'self') and offline (PWA). The file is copied
// from node_modules/zxing-wasm/dist/reader/zxing_reader.wasm into
// public/zxing/. Refresh public/zxing/zxing_reader.wasm whenever the
// barcode-detector / zxing-wasm dependency is bumped.
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
}

interface UseBarcodeScannerReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isSupported: boolean;
  isStreaming: boolean;
  error: string | null;
  startScanning: () => Promise<void>;
  stopScanning: () => void;
  toggleTorch: () => Promise<void>;
  torchSupported: boolean;
  torchEnabled: boolean;
  usingNativeAPI: boolean;
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
}: UseBarcodeScannerOptions): UseBarcodeScannerReturn => {
  // State
  const [isReady, setIsReady] = useState(false);
  const [usingNativeAPI, setUsingNativeAPI] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsStreaming(false);
    setTorchEnabled(false);
    isInitializedRef.current = false; // Reset initialization state when stopping
  }, []);

  // Barcode detection loop (drives both native and WASM detectors)
  const detectBarcodes = useCallback(async () => {
    if (!videoRef.current || !detectorRef.current || !canvasRef.current) {
      return;
    }

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

    // Focus detection on the center region
    const centerX = canvas.width * 0.15;
    const centerY = canvas.height * 0.35;
    const regionWidth = canvas.width * 0.7;
    const regionHeight = canvas.height * 0.3;

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

        onDetect({
          text: detectedBarcode.rawValue,
          type: barcodeType,
        });

        // Stop scanning after successful detection
        stopScanning();
        return;
      }
    } catch (_err) {
      // Silently continue on detection errors
    }

    // Continue scanning
    animationFrameRef.current = requestAnimationFrame(() =>
      detectBarcodesRef.current?.(),
    );
  }, [onDetect, stopScanning]);

  // Update the ref with the latest detectBarcodes function
  detectBarcodesRef.current = detectBarcodes;

  // Memoize constraints to prevent re-initialization
  const stableConstraints = useMemo(() => constraints, [constraints]);

  // Start scanning function
  const startScanning = useCallback(async () => {
    if (!detectorRef.current || isInitializedRef.current) return; // Wait for detector and prevent double init

    try {
      setError(null);
      isInitializedRef.current = true;

      const stream =
        await navigator.mediaDevices.getUserMedia(stableConstraints);
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

        setIsStreaming(true);

        // Check for torch support
        const videoTrack = stream.getVideoTracks()[0];
        const capabilities = videoTrack.getCapabilities?.() as
          | ExtendedMediaTrackCapabilities
          | undefined;
        setTorchSupported(!!capabilities?.torch);

        // Start barcode detection
        detectBarcodesRef.current?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start camera");
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
    startScanning,
    stopScanning,
    toggleTorch,
    torchSupported,
    torchEnabled,
    usingNativeAPI,
  };
};
