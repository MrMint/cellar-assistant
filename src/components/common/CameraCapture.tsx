"use client";

import {
  Box,
  Card,
  CardCover,
  CircularProgress,
  IconButton,
  styled,
} from "@mui/joy";
import { useCallback, useEffect, useRef, useState } from "react";
import { BsCamera, BsLightbulb, BsLightbulbFill } from "react-icons/bs";
import Webcam from "react-webcam";

// Video constraints for quality capture - square aspect ratio
// Note: colorTemperature and iso removed - poorly supported on Android and cause white balance issues
const getVideoConstraints = () => ({
  width: { ideal: 1920, min: 1080 },
  height: { ideal: 1920, min: 1080 },
  aspectRatio: 1,
  facingMode: "environment",
  // These are well-supported across devices
  focusMode: "continuous",
  exposureMode: "continuous",
  whiteBalanceMode: "continuous",
});

const CameraContainer = styled(Box)(() => ({
  position: "relative",
  width: "100%",
  height: "100%",
}));

const FocusIndicator = styled(Box)<{ x: number; y: number; visible: boolean }>(
  ({ x, y, visible }) => ({
    position: "absolute",
    left: `${x - 25}px`,
    top: `${y - 25}px`,
    width: "50px",
    height: "50px",
    border: "2px solid rgba(255, 255, 255, 0.8)",
    borderRadius: "50%",
    pointerEvents: "none",
    opacity: visible ? 1 : 0,
    transform: visible ? "scale(1)" : "scale(1.5)",
    transition: "all 0.3s ease",
    "&::before": {
      content: '""',
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "2px",
      height: "20px",
      backgroundColor: "rgba(255, 255, 255, 0.8)",
    },
    "&::after": {
      content: '""',
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "20px",
      height: "2px",
      backgroundColor: "rgba(255, 255, 255, 0.8)",
    },
  }),
);

const TapToFocusOverlay = styled(Box)(() => ({
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  cursor: "crosshair",
}));

const ControlsContainer = styled(Box)(() => ({
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "16px",
  backgroundColor: "rgba(0, 0, 0, 0.3)",
  backdropFilter: "blur(4px)",
}));

export const CameraCapture = ({
  onCapture,
}: {
  onCapture: (image: string) => void;
}) => {
  const webcamRef = useRef<Webcam | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [showFocusIndicator, setShowFocusIndicator] = useState(false);

  // Check for torch support when video loads
  const handleUserMedia = useCallback((stream: MediaStream) => {
    streamRef.current = stream;
    setIsVideoLoaded(true);

    // Check for torch capability
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      const capabilities = videoTrack.getCapabilities?.();
      setTorchSupported(
        !!(capabilities as MediaTrackCapabilities & { torch?: boolean })?.torch,
      );
    }
  }, []);

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

  return (
    <Card sx={{ aspectRatio: "1", maxHeight: "600px" }}>
      {!isVideoLoaded && (
        <CardCover>
          <CircularProgress />
        </CardCover>
      )}
      <CardCover>
        <CameraContainer>
          <Webcam
            ref={webcamRef}
            audio={false}
            forceScreenshotSourceSize={true}
            screenshotQuality={1}
            screenshotFormat="image/jpeg"
            videoConstraints={getVideoConstraints()}
            onUserMedia={handleUserMedia}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
          {isVideoLoaded && <TapToFocusOverlay onClick={handleTapToFocus} />}
          {focusPoint && (
            <FocusIndicator
              x={focusPoint.x}
              y={focusPoint.y}
              visible={showFocusIndicator}
            />
          )}
          <ControlsContainer>
            {/* Torch control */}
            {torchSupported && (
              <IconButton
                onClick={toggleTorch}
                variant={torchEnabled ? "solid" : "outlined"}
                color={torchEnabled ? "warning" : "neutral"}
                size="md"
              >
                {torchEnabled ? <BsLightbulbFill /> : <BsLightbulb />}
              </IconButton>
            )}

            {/* Spacer when torch not available */}
            {!torchSupported && <Box />}

            {/* Capture button */}
            <IconButton
              onClick={capture}
              size="lg"
              variant="solid"
              color="primary"
              disabled={isCapturing}
              sx={{
                transform: isCapturing ? "scale(0.95)" : "scale(1)",
                transition: "transform 0.1s ease",
              }}
            >
              <BsCamera />
            </IconButton>

            {/* Empty spacer for balance */}
            <Box sx={{ width: 40 }} />
          </ControlsContainer>
        </CameraContainer>
      </CardCover>
    </Card>
  );
};
