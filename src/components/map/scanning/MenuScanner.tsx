"use client";

import { graphql } from "@cellar-assistant/shared";
import {
  CameraAlt,
  CheckCircle,
  Error as ErrorIcon,
  PhotoLibrary,
  Visibility,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Typography,
} from "@mui/joy";
import { useState } from "react";
import { useMutation } from "urql";
import { useNhostClient } from "@/components/providers/NhostClientProvider";
import { CameraCapture } from "../../common/CameraCapture";

interface MenuScannerProps {
  placeId: string;
  userId: string;
}

interface ScanResult {
  id: string;
  processing_status: "pending" | "processing" | "completed" | "failed";
  items_detected: number;
  items_matched: number;
  confidence_score?: number;
  processing_error?: string;
}

const CreateMenuScanMutation = graphql(`
  mutation CreateMenuScan($scan: menu_scans_insert_input!) {
    insert_menu_scans_one(object: $scan) {
      id
      processing_status
    }
  }
`);

export function MenuScanner({ placeId, userId }: MenuScannerProps) {
  const nhost = useNhostClient();
  const [, createMenuScan] = useMutation(CreateMenuScanMutation);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [_uploadProgress, _setUploadProgress] = useState(0);

  // Upload and process scan
  const uploadAndProcessScan = async (
    imageDataUrl: string,
    placeId: string,
    userId: string,
  ) => {
    try {
      // Convert data URL to blob
      const response = await fetch(imageDataUrl);
      const blob = await response.blob();

      // Create a file from blob
      const file = new File([blob], `menu-scan-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });

      // Upload to Nhost storage
      const {
        body: {
          processedFiles: [fileMetadata],
        },
        status,
      } = await nhost.storage.uploadFiles(
        {
          "file[]": [file],
          "bucket-id": "default",
        },
        {
          headers: {
            Authorization: `Bearer ${nhost.getUserSession()?.accessToken}`,
          },
        },
      );

      if (status < 200 || status >= 300) {
        throw new Error(`Upload failed with status ${status}`);
      }

      if (!fileMetadata?.id) {
        throw new Error("No file ID returned from upload");
      }

      // Create menu scan record
      const scanResult = await createMenuScan({
        scan: {
          user_id: userId,
          place_id: placeId,
          original_image_id: fileMetadata.id,
          processing_status: "pending",
        },
      });

      if (scanResult.error || !scanResult.data?.insert_menu_scans_one) {
        throw new Error("Failed to create scan record");
      }

      const scanId = scanResult.data.insert_menu_scans_one.id;

      // Trigger processing function
      const processingResponse = await fetch("/api/functions/processMenuScan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scanId,
          userId,
        }),
      });

      if (!processingResponse.ok) {
        throw new Error("Failed to process scan");
      }

      const result = await processingResponse.json();

      return {
        id: scanId,
        processing_status: "completed" as const,
        items_detected: result.itemsDetected || 0,
        items_matched: 0, // Will be calculated by matching function
        confidence_score: result.confidenceScore || 0,
      };
    } catch (error) {
      console.error("Scan processing error:", error);
      throw error;
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const handleCameraCapture = (imageDataUrl: string) => {
    if (!userId) return;

    setIsScanning(true);
    setScanResult(null);
    setShowCamera(false);

    uploadAndProcessScan(imageDataUrl, placeId, userId)
      .then((result) => setScanResult(result))
      .catch((_error) => {
        setScanResult({
          id: "error",
          processing_status: "failed",
          items_detected: 0,
          items_matched: 0,
          processing_error: "Failed to process menu scan",
        });
      })
      .finally(() => setIsScanning(false));
  };

  const handleStartScan = async () => {
    if (!selectedFile || !userId) return;

    setIsScanning(true);
    setScanResult(null);

    try {
      // Convert file to data URL
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (e.target?.result) {
          try {
            const result = await uploadAndProcessScan(
              e.target.result as string,
              placeId,
              userId,
            );
            setScanResult(result);
          } catch (_error) {
            setScanResult({
              id: "error",
              processing_status: "failed",
              items_detected: 0,
              items_matched: 0,
              processing_error: "Failed to process menu scan",
            });
          }
        }
        setIsScanning(false);
      };
      reader.readAsDataURL(selectedFile);
    } catch (_error) {
      setScanResult({
        id: "error",
        processing_status: "failed",
        items_detected: 0,
        items_matched: 0,
        processing_error: "Failed to process menu scan",
      });
      setIsScanning(false);
    }
  };

  const openCamera = () => {
    setShowCamera(true);
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setScanResult(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
  };

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Typography level="h4" sx={{ mb: 2 }}>
            Scan Menu with Camera
          </Typography>

          <Typography level="body-md" sx={{ color: "text.secondary", mb: 3 }}>
            Take a photo of the menu and we'll automatically extract the items
            for you. Our AI will identify wines, beers, spirits, and coffees and
            match them to your database.
          </Typography>

          {!selectedFile && !scanResult && (
            <Stack spacing={2}>
              <Stack direction="row" spacing={2}>
                <Button
                  variant="solid"
                  startDecorator={<CameraAlt />}
                  onClick={openCamera}
                  size="lg"
                >
                  Take Photo
                </Button>

                <Button
                  variant="outlined"
                  startDecorator={<PhotoLibrary />}
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

          {selectedFile && previewUrl && !scanResult && (
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
                  {isScanning ? "Processing..." : "Scan Menu"}
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

          {isScanning && (
            <Stack spacing={2}>
              <LinearProgress />
              <Typography
                level="body-sm"
                sx={{ textAlign: "center", color: "text.secondary" }}
              >
                Processing your menu image... This may take up to 30 seconds.
              </Typography>
            </Stack>
          )}

          {scanResult && (
            <Stack spacing={2}>
              {scanResult.processing_status === "completed" ? (
                <Alert color="success" startDecorator={<CheckCircle />}>
                  <Stack spacing={1}>
                    <Typography level="title-sm">Scan Complete!</Typography>
                    <Typography level="body-sm">
                      Found {scanResult.items_detected} items, matched{" "}
                      {scanResult.items_matched} to existing database entries.
                      {scanResult.confidence_score &&
                        ` Overall confidence: ${(scanResult.confidence_score * 100).toFixed(0)}%`}
                    </Typography>
                  </Stack>
                </Alert>
              ) : (
                <Alert color="danger" startDecorator={<ErrorIcon />}>
                  <Typography level="title-sm">Scan Failed</Typography>
                  <Typography level="body-sm">
                    {scanResult.processing_error ||
                      "Failed to process the menu image."}
                  </Typography>
                </Alert>
              )}

              <Stack
                direction="row"
                spacing={2}
                sx={{ justifyContent: "center" }}
              >
                {scanResult.processing_status === "completed" && (
                  <Button
                    variant="solid"
                    startDecorator={<Visibility />}
                    href={`/map/scans/${scanResult.id}`}
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
              • Ensure the menu text is clear and well-lit
            </Typography>
            <Typography level="body-sm">
              • Hold the camera steady to avoid blur
            </Typography>
            <Typography level="body-sm">
              • Take multiple photos if the menu spans several pages
            </Typography>
            <Typography level="body-sm">
              • Focus on beverage sections (wine list, beer menu, cocktails)
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
