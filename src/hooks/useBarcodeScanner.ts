import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Result, useZxing } from "react-zxing";
import { type Barcode, BarcodeType } from "@/constants";

// Native BarcodeDetector API types
interface BarcodeDetectorOptions {
  formats?: string[];
}

interface DetectedBarcode {
  rawValue: string;
  format: string;
  boundingBox?: DOMRectReadOnly;
  cornerPoints?: Array<{ x: number; y: number }>;
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
      new (
        options?: BarcodeDetectorOptions,
      ): {
        detect(image: ImageBitmapSource): Promise<DetectedBarcode[]>;
      };
      getSupportedFormats(): Promise<string[]>;
    };
  }
}

const SUPPORTED_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

// Map native format names to our BarcodeType enum
const formatMap: Record<string, BarcodeType> = {
  ean_13: BarcodeType.EAN_13,
  ean_8: BarcodeType.EAN_8,
  upc_a: BarcodeType.UPC_A,
  upc_e: BarcodeType.UPC_E,
};

// ZXing hints for fallback
const hints = new Map<DecodeHintType, BarcodeFormat[]>([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [
      BarcodeFormat.EAN_13,
      BarcodeFormat.UPC_A,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_E,
    ],
  ],
]);

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
  const [nativeSupported, setNativeSupported] = useState<boolean | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [fallbackResult, setFallbackResult] = useState<Result>();

  // Refs for native implementation
  const isInitializedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<{
    detect(image: ImageBitmapSource): Promise<DetectedBarcode[]>;
  } | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const canvasRef = useRef<HTMLCanvasElement | undefined>(undefined);
  const detectBarcodesRef = useRef<(() => void) | undefined>(undefined);

  // ZXing fallback hook - conditionally initialize
  const shouldUseFallback = nativeSupported === false;

  // Create stable constraints object to prevent re-initialization
  const fallbackConstraints = useMemo(() => {
    return shouldUseFallback ? constraints : { video: false };
  }, [shouldUseFallback, constraints]);

  const {
    ref: zxingVideoRef,
    torch: { off, on, isOn, isAvailable },
  } = useZxing({
    onDecodeResult(result) {
      if (shouldUseFallback) {
        setFallbackResult(result);
      }
    },
    constraints: fallbackConstraints,
    hints,
  });

  // Check native BarcodeDetector support on mount
  useEffect(() => {
    const checkSupport = async () => {
      if ("BarcodeDetector" in window && window.BarcodeDetector) {
        try {
          const supportedFormats =
            await window.BarcodeDetector.getSupportedFormats();
          if (supportedFormats) {
            const hasRequiredFormats = SUPPORTED_FORMATS.some((format) =>
              supportedFormats.includes(format),
            );
            setNativeSupported(hasRequiredFormats);

            if (hasRequiredFormats && window.BarcodeDetector) {
              detectorRef.current = new window.BarcodeDetector({
                formats: SUPPORTED_FORMATS.filter((format) =>
                  supportedFormats.includes(format),
                ),
              });
            }
          }
        } catch (_err) {
          setNativeSupported(false);
        }
      } else {
        setNativeSupported(false);
      }
    };

    checkSupport();
  }, []);

  // Initialize canvas for native detection
  useEffect(() => {
    if (nativeSupported && !canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
  }, [nativeSupported]);

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

  // Native barcode detection function
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

  // Handle fallback (ZXing) detection results
  useEffect(() => {
    if (fallbackResult !== undefined && shouldUseFallback) {
      let type: BarcodeType | undefined;
      switch (fallbackResult.getBarcodeFormat()) {
        case BarcodeFormat.UPC_A:
          type = BarcodeType.UPC_A;
          break;
        case BarcodeFormat.UPC_E:
          type = BarcodeType.UPC_E;
          break;
        case BarcodeFormat.EAN_13:
          type = BarcodeType.EAN_13;
          break;
        case BarcodeFormat.EAN_8:
          type = BarcodeType.EAN_8;
          break;
        default:
          break;
      }

      onDetect({
        text: fallbackResult.getText(),
        type: type,
      });
    }
  }, [fallbackResult, shouldUseFallback, onDetect]);

  // Memoize constraints to prevent re-initialization
  const stableConstraints = useMemo(() => constraints, [constraints]);

  // Start scanning function
  const startScanning = useCallback(async () => {
    if (nativeSupported === null || isInitializedRef.current) return; // Wait for support check and prevent double init

    try {
      setError(null);
      isInitializedRef.current = true;

      if (nativeSupported) {
        // Use native implementation
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
      } else {
        // ZXing handles this automatically, just set streaming state
        setIsStreaming(true);
        setTorchSupported(isAvailable === true);
        setTorchEnabled(isOn);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start camera");
      setIsStreaming(false);
      isInitializedRef.current = false; // Reset initialization state on error
    }
  }, [nativeSupported, stableConstraints, isAvailable, isOn]);

  // Toggle torch function
  const toggleTorch = useCallback(async () => {
    if (nativeSupported) {
      // Native implementation
      if (!streamRef.current || !torchSupported) return;

      try {
        const videoTrack = streamRef.current.getVideoTracks()[0];
        const newTorchState = !torchEnabled;

        await videoTrack.applyConstraints({
          advanced: [
            { torch: newTorchState } as ExtendedMediaTrackConstraintSet,
          ],
        });

        setTorchEnabled(newTorchState);
      } catch (err) {
        console.warn("Failed to toggle torch:", err);
      }
    } else {
      // ZXing implementation
      if (isOn) {
        off();
      } else {
        on();
      }
    }
  }, [nativeSupported, torchSupported, torchEnabled, isOn, off, on]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, [stopScanning]);

  // Use the appropriate video ref
  const activeVideoRef = nativeSupported ? videoRef : zxingVideoRef;

  return {
    videoRef: activeVideoRef,
    isSupported: nativeSupported !== null,
    isStreaming,
    error,
    startScanning,
    stopScanning,
    toggleTorch,
    torchSupported: nativeSupported ? torchSupported : isAvailable === true,
    torchEnabled: nativeSupported ? torchEnabled : isOn,
    usingNativeAPI: nativeSupported === true,
  };
};
