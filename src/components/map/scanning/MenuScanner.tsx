"use client";

import {
  MdCameraAlt,
  MdCheckCircle,
  MdError,
  MdPhotoLibrary,
  MdVisibility,
} from "react-icons/md";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Typography,
} from "@mui/joy";
import NextLink from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MenuScanStatus } from "@/app/actions/menuScanning";
import {
  getMenuScanStatus,
  uploadAndProcessMenuScan,
} from "@/app/actions/menuScanning";
import { useInterval } from "@/utilities/hooks";

import { CameraCapture } from "../../common/CameraCapture";

interface MenuScannerProps {
  placeId: string;
  userId: string;
  onScanComplete?: () => void;
}

type ProcessingStep = "idle" | "uploading" | "analyzing" | "matching" | "done";

function getProcessingStep(status: MenuScanStatus | null): ProcessingStep {
  if (!status) return "idle";
  switch (status.processing_status) {
    case "pending":
      return "uploading";
    case "processing":
      return status.items_detected ? "matching" : "analyzing";
    case "completed":
      return "done";
    case "failed":
      return "done";
    default:
      return "idle";
  }
}

const STEP_LABELS: Record<ProcessingStep, string> = {
  idle: "",
  uploading: "Uploading image...",
  analyzing: "Analyzing menu with AI...",
  matching: "Matching items to database...",
  done: "",
};

export function MenuScanner({
  placeId,
  userId,
  onScanComplete,
}: MenuScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<MenuScanStatus | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const isPollingRef = useRef(false);

  const processingStep = getProcessingStep(scanStatus);
  const isComplete = scanStatus?.processing_status === "completed";
  const isFailed = scanStatus?.processing_status === "failed";

  // Poll for scan status every 2.5 seconds while processing
  const pollCallback = useCallback(async () => {
    if (!scanId || !isPollingRef.current) return;

    const status = await getMenuScanStatus(scanId);
    if (!status) return;

    setScanStatus(status);

    if (
      status.processing_status === "completed" ||
      status.processing_status === "failed"
    ) {
      isPollingRef.current = false;
      setIsScanning(false);
      if (status.processing_status === "completed") {
        onScanComplete?.();
      }
    }
  }, [scanId, onScanComplete]);

  useInterval(pollCallback, isPollingRef.current ? 2500 : 86400000);

  const startScan = async (file: File) => {
    setIsScanning(true);
    setScanStatus(null);
    setScanId(null);
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("placeId", placeId);

    const result = await uploadAndProcessMenuScan(formData);

    if (result.success && result.scanId) {
      setScanId(result.scanId);
      setScanStatus({
        id: result.scanId,
        processing_status: "pending",
        items_detected: null,
        items_matched: null,
        confidence_score: null,
        processing_error: null,
        place_id: placeId,
      });
      isPollingRef.current = true;
    } else {
      setUploadError(result.error || "Failed to start scan");
      setIsScanning(false);
    }
  };

  // Revoke object URL on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Revoke previous object URL before creating a new one
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const handleCameraCapture = async (imageDataUrl: string) => {
    if (!userId) return;

    setShowCamera(false);

    // Convert data URL to File
    const response = await fetch(imageDataUrl);
    const blob = await response.blob();
    const file = new File([blob], `menu-scan-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });

    setSelectedFile(file);
    setPreviewUrl(imageDataUrl);
    await startScan(file);
  };

  const handleStartScan = async () => {
    if (!selectedFile || !userId) return;
    await startScan(selectedFile);
  };

  const handleReset = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setScanId(null);
    setScanStatus(null);
    setUploadError(null);
    isPollingRef.current = false;
  };

  const showCaptureButtons = !selectedFile && !scanStatus && !isScanning;
  const showPreview =
    selectedFile && previewUrl && !scanStatus && !isScanning && !uploadError;
  const showProcessing = isScanning && !isComplete && !isFailed;
  const showResult = isComplete || isFailed || uploadError;

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Typography level="h4" sx={{ mb: 2 }}>
            Scan Menu with Camera
          </Typography>

          <Typography level="body-md" sx={{ color: "text.secondary", mb: 3 }}>
            Take a photo of the menu and we&apos;ll automatically extract the
            items for you. Our AI will identify wines, beers, spirits, and
            coffees and match them to your database.
          </Typography>

          {showCaptureButtons && (
            <Stack spacing={2}>
              <Stack direction="row" spacing={2}>
                <Button
                  variant="solid"
                  startDecorator={<MdCameraAlt />}
                  onClick={() => setShowCamera(true)}
                  size="lg"
                >
                  Take Photo
                </Button>

                <Button
                  variant="outlined"
                  startDecorator={<MdPhotoLibrary />}
                  component="label"
                  size="lg"
                >
                  Choose File
                  <input
                    id="camera-file-input"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileSelect}
                    style={{ display: "none" }}
                  />
                </Button>
              </Stack>

              <Typography level="body-xs" sx={{ color: "text.secondary" }}>
                Best results with clear, well-lit photos. Make sure the text is
                readable.
              </Typography>
            </Stack>
          )}

          {showPreview && (
            <Stack spacing={3}>
              <Box
                sx={{
                  maxWidth: 400,
                  mx: "auto",
                  "& img": {
                    width: "100%",
                    height: "auto",
                    borderRadius: "md",
                  },
                }}
              >
                <img src={previewUrl} alt="Menu preview" />
              </Box>

              <Typography level="body-sm" sx={{ textAlign: "center" }}>
                <strong>{selectedFile.name}</strong> (
                {(selectedFile.size / 1024 / 1024).toFixed(1)} MB)
              </Typography>

              <Stack
                direction="row"
                spacing={2}
                sx={{ justifyContent: "center" }}
              >
                <Button
                  variant="solid"
                  onClick={handleStartScan}
                  loading={isScanning}
                  disabled={isScanning}
                  size="lg"
                >
                  Scan Menu
                </Button>

                <Button
                  variant="outlined"
                  onClick={handleReset}
                  disabled={isScanning}
                >
                  Choose Different Photo
                </Button>
              </Stack>
            </Stack>
          )}

          {showProcessing && (
            <Stack spacing={2}>
              <LinearProgress />
              <Stack
                direction="row"
                spacing={1}
                sx={{ justifyContent: "center", alignItems: "center" }}
              >
                {(["uploading", "analyzing", "matching"] as const).map(
                  (step) => (
                    <Chip
                      key={step}
                      size="sm"
                      variant={processingStep === step ? "solid" : "outlined"}
                      color={
                        processingStep === step
                          ? "primary"
                          : (
                                ["uploading", "analyzing", "matching"] as const
                              ).indexOf(step) <
                              (
                                ["uploading", "analyzing", "matching"] as const
                              ).indexOf(
                                processingStep as
                                  | "uploading"
                                  | "analyzing"
                                  | "matching",
                              )
                            ? "success"
                            : "neutral"
                      }
                    >
                      {step === "uploading"
                        ? "Upload"
                        : step === "analyzing"
                          ? "Analyze"
                          : "Match"}
                    </Chip>
                  ),
                )}
              </Stack>
              <Typography
                level="body-sm"
                sx={{ textAlign: "center", color: "text.secondary" }}
              >
                {STEP_LABELS[processingStep] || "Processing your menu image..."}
              </Typography>
            </Stack>
          )}

          {showResult && (
            <Stack spacing={2}>
              {uploadError ? (
                <Alert color="danger" startDecorator={<MdError />}>
                  <Typography level="title-sm">Upload Failed</Typography>
                  <Typography level="body-sm">{uploadError}</Typography>
                </Alert>
              ) : isComplete ? (
                <Alert color="success" startDecorator={<MdCheckCircle />}>
                  <Stack spacing={1}>
                    <Typography level="title-sm">Scan Complete!</Typography>
                    <Typography level="body-sm">
                      Found {scanStatus?.items_detected ?? 0} items
                      {scanStatus?.items_matched
                        ? `, matched ${scanStatus.items_matched} to existing database entries`
                        : ""}
                      .
                      {scanStatus?.confidence_score
                        ? ` Overall confidence: ${(scanStatus.confidence_score * 100).toFixed(0)}%`
                        : ""}
                    </Typography>
                  </Stack>
                </Alert>
              ) : (
                <Alert color="danger" startDecorator={<MdError />}>
                  <Typography level="title-sm">Scan Failed</Typography>
                  <Typography level="body-sm">
                    {scanStatus?.processing_error ||
                      "Failed to process the menu image."}
                  </Typography>
                </Alert>
              )}

              <Stack
                direction="row"
                spacing={2}
                sx={{ justifyContent: "center" }}
              >
                {isComplete && scanId && (
                  <Button
                    variant="solid"
                    startDecorator={<MdVisibility />}
                    component={NextLink}
                    href={`/map/scans/${scanId}`}
                  >
                    View Results
                  </Button>
                )}

                <Button variant="outlined" onClick={handleReset}>
                  Scan Another Menu
                </Button>
              </Stack>
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography level="title-md" sx={{ mb: 2 }}>
            Tips for Better Results
          </Typography>
          <Stack spacing={1}>
            <Typography level="body-sm">
              Ensure the menu text is clear and well-lit
            </Typography>
            <Typography level="body-sm">
              Hold the camera steady to avoid blur
            </Typography>
            <Typography level="body-sm">
              Take multiple photos if the menu spans several pages
            </Typography>
            <Typography level="body-sm">
              Focus on beverage sections (wine list, beer menu, cocktails)
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      {/* Camera Modal */}
      <Modal open={showCamera} onClose={() => setShowCamera(false)}>
        <ModalDialog size="lg" sx={{ width: "95vw", maxWidth: "600px" }}>
          <DialogTitle>
            Scan Menu
            <ModalClose />
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2}>
              <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                Position the menu clearly in the frame and tap the capture
                button.
              </Typography>
              <Box sx={{ height: "400px" }}>
                <CameraCapture onCapture={handleCameraCapture} />
              </Box>
            </Stack>
          </DialogContent>
        </ModalDialog>
      </Modal>
    </Stack>
  );
}
