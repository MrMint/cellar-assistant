"use client";

import {
  Box,
  Button,
  Card,
  CardContent,
  CardCover,
  CircularProgress,
  styled,
  Typography,
} from "@mui/joy";
import { useCallback, useEffect, useState } from "react";
import type { Barcode } from "@/constants";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";

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
};

// Optimized constraints for barcode scanning (moved outside component to prevent re-creation)
const videoConstraints = {
  video: {
    width: { ideal: 1920, min: 640 },
    height: { ideal: 1080, min: 480 },
    facingMode: "environment",
    focusMode: "continuous" as const,
    whiteBalanceMode: "continuous" as const,
  },
};

export const BarcodeScanner = ({ onChange }: BarcodeScannerProps) => {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
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

  const handleVideoLoad = () => {
    setIsVideoLoaded(true);
  };

  return (
    <Card sx={{ aspectRatio: "16/10", position: "relative" }}>
      {!isVideoLoaded && (
        <CardCover>
          <CircularProgress />
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
