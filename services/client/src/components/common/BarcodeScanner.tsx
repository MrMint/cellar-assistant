"use client";

import {
  Box,
  Button,
  Card,
  CardContent,
  CardCover,
  CircularProgress,
  Stack,
  styled,
  Typography,
} from "@mui/joy";
import { useCallback, useEffect, useState } from "react";
import type { Barcode } from "@/constants";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useCameraStatus } from "@/hooks/useCameraStatus";
import { BARCODE_SCAN_CONSTRAINTS } from "@/lib/camera/camera-status";

const StyledVideo = styled("video")(() => ({
  objectFit: "cover",
  width: "100%",
  height: "100%",
  // Ensure we're showing the center of the video stream
  objectPosition: "center center",
}));

const DetectionOverlay = styled(Box, {
  shouldForwardProp: (prop) => prop !== "success",
})<{ success?: boolean }>(({ success }) => ({
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "70%",
  height: "30%",
  border: success
    ? "3px solid rgba(0, 255, 0, 0.9)"
    : "2px solid rgba(255, 255, 255, 0.8)",
  borderRadius: "8px",
  backgroundColor: success
    ? "rgba(0, 255, 0, 0.2)"
    : "rgba(255, 255, 255, 0.1)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
  transition: "all 0.3s ease",
  "&::before": {
    content: '""',
    position: "absolute",
    top: "-3px",
    left: "-3px",
    right: "-3px",
    bottom: "-3px",
    border: success
      ? "3px solid rgba(0, 255, 0, 0.9)"
      : "2px solid rgba(0, 255, 0, 0.6)",
    borderRadius: "8px",
    opacity: success ? 1 : 0,
    animation: success ? "successFlash 0.5s ease" : "pulse 2s infinite",
  },
  "@keyframes pulse": {
    "0%, 100%": {
      opacity: 0,
    },
    "50%": {
      opacity: 1,
    },
  },
  "@keyframes successFlash": {
    "0%": {
      opacity: 0,
      transform: "scale(0.95)",
    },
    "50%": {
      opacity: 1,
      transform: "scale(1.05)",
    },
    "100%": {
      opacity: 1,
      transform: "scale(1)",
    },
  },
}));

const DetectionGuide = styled(Typography)(() => ({
  color: "rgba(255, 255, 255, 0.9)",
  textAlign: "center",
  textShadow: "0 1px 3px rgba(0, 0, 0, 0.8)",
  fontSize: "0.875rem",
  fontWeight: 500,
}));

type BarcodeScannerProps = {
  onChange: (result: Barcode) => void;
  /**
   * What to do instead when the camera can't be used, after the reason. The
   * default is the add-item flow's (N04), which has a label-photo step to skip
   * to; search has none, so it says its own.
   */
  cameraFallbackHint?: string;
};

const ADD_ITEM_FALLBACK_HINT =
  "Skip this step to photograph the label instead.";

// N04: `ideal`-only constraints (`BARCODE_SCAN_CONSTRAINTS`); the old
// `min: 640 × 480` could make getUserMedia refuse outright.
const videoConstraints: MediaStreamConstraints = BARCODE_SCAN_CONSTRAINTS;

export const BarcodeScanner = ({
  onChange,
  cameraFallbackHint = ADD_ITEM_FALLBACK_HINT,
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
    usingNativeAPI,
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
    <Card sx={{ aspectRatio: "16/10", position: "relative" }}>
      {!isVideoLoaded && failed === null && (
        <CardCover>
          <CircularProgress />
        </CardCover>
      )}
      {failed !== null && !isVideoLoaded && (
        <CardCover sx={{ zIndex: 1 }}>
          <Stack
            spacing={1.5}
            alignItems="center"
            justifyContent="center"
            sx={{ p: 3, textAlign: "center" }}
            role="alert"
          >
            <Typography level="body-md">
              {failed.reason === "timeout"
                ? "The camera is taking too long to start."
                : "The barcode scanner can't use the camera."}{" "}
              {cameraFallbackHint}
            </Typography>
            <Button variant="outlined" color="neutral" onClick={handleRetry}>
              Try again
            </Button>
          </Stack>
        </CardCover>
      )}
      <CardCover>
        <StyledVideo
          ref={videoRef}
          onLoadedData={handleVideoLoad}
          autoPlay
          playsInline
          muted
        />
      </CardCover>

      {/* Detection overlay to show scanning area */}
      {isVideoLoaded && (
        <CardCover>
          <DetectionOverlay success={detectionSuccess}>
            <DetectionGuide>
              {detectionSuccess
                ? "Barcode detected!"
                : "Position barcode within this frame"}
            </DetectionGuide>
          </DetectionOverlay>
        </CardCover>
      )}

      {isVideoLoaded && (
        <CardContent>
          {torchSupported && (
            <Button onClick={toggleTorch}>
              {torchEnabled ? "Turn off light" : "Turn on light"}
            </Button>
          )}
          <Typography level="body-lg" fontWeight="lg">
            Scanning{usingNativeAPI ? " (Native API)" : " (ZXing)"}...
          </Typography>
          {error && (
            <Typography level="body-sm" color="danger">
              {error}
            </Typography>
          )}
        </CardContent>
      )}
    </Card>
  );
};
