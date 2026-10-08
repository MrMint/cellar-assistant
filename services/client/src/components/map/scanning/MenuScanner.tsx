"use client";

/**
 * `82450ad1:src/components/map/scanning/MenuScanner.tsx`, restored — the
 * place page's "Camera Scan" tab, which is where scanning a menu starts.
 *
 * `uploadAndProcessMenuScan(formData)` (a server action that uploaded to
 * Nhost and fired `processMenuScan` with the webhook secret) →
 * `usePlaceActions().uploadAndProcessMenuScan(file, placeId)`: presigned
 * upload, verify, then `createMenuScan` with this place as its `placeHint`;
 * the pipeline runs from the outbox. The status poll is a network-only
 * `menuScan(id:)` read on `usePollWhile`'s backing-off schedule. The camera
 * image comes back as a JPEG data URL and is turned into a `File` in
 * memory — never posted as base64 (E2d/E2f).
 *
 * N06a: once extraction has read lines, the scanner opens the results page
 * itself instead of stopping on "Scan Complete!" — the results page shows the
 * match run landing (`scan-progress.ts`). `onScanComplete` fires when the
 * whole pipeline has settled (`matchStatus`), not when extraction finishes:
 * a refetch at extraction time read the place's menu before its lines were
 * filed, which was the place page's refetch race.
 */

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
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  MdCameraAlt,
  MdCheckCircle,
  MdError,
  MdPhotoLibrary,
  MdVisibility,
} from "react-icons/md";
import { CameraCapture } from "../../common/CameraCapture";
import { type MenuScanStatus, usePlaceActions } from "../actions";
import {
  isExtractionDone,
  isScanSettled,
  type ScanPhase,
  type ScanProgress,
  scanPhase,
  shouldOpenResults,
} from "./scan-progress";
import { usePollWhile } from "./use-poll-while";

interface MenuScannerProps {
  placeId: string;
  /** The old `getServerUserId()`; unused — the API knows the viewer. */
  userId?: string;
  onScanComplete?: () => void;
}

/** A `data:` URL as a `File`, decoded in memory (no `fetch`, so no CSP). */
function dataUrlToFile(dataUrl: string, name: string): File {
  const [header, body = ""] = dataUrl.split(",");
  const type = /data:([^;]+)/.exec(header ?? "")?.[1] ?? "image/jpeg";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type });
}

const progressOf = (status: MenuScanStatus | null): ScanProgress | null =>
  status === null
    ? null
    : {
        processingStatus: status.processing_status,
        matchStatus: status.match_status,
      };

const PHASES = ["uploading", "reading", "matching"] as const;

const PHASE_CHIPS: Record<(typeof PHASES)[number], string> = {
  uploading: "Upload",
  reading: "Read",
  matching: "Match",
};

const PHASE_LABELS: Record<ScanPhase, string> = {
  uploading: "Uploading image...",
  reading: "Reading the menu...",
  matching: "Matching lines to the catalog...",
  done: "",
};

export function MenuScanner({ placeId, onScanComplete }: MenuScannerProps) {
  const router = useRouter();
  const { getMenuScanStatus, uploadAndProcessMenuScan } = usePlaceActions();
  const [isScanning, setIsScanning] = useState(false);
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<MenuScanStatus | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const settledRef = useRef<string | null>(null);

  const progress = progressOf(scanStatus);
  const processingStep = scanPhase(progress);
  const isComplete = scanStatus?.processing_status === "completed";
  const isFailed = scanStatus?.processing_status === "failed";
  const opensResults =
    scanStatus !== null &&
    shouldOpenResults({
      ...(progress ?? { processingStatus: "pending", matchStatus: "waiting" }),
      itemsDetected: scanStatus.items_detected,
    });

  // Re-read until the whole pipeline has settled, so `onScanComplete` really
  // fires then. A scan with lines hands off to the results page as soon as
  // extraction is done, which unmounts this and stops the loop; one with
  // none is `skipped` at once.
  const { gaveUp, restart } = usePollWhile(
    scanId !== null && progress !== null && !isScanSettled(progress),
    async () => {
      if (!scanId) return;
      const status = await getMenuScanStatus(scanId);
      if (status) setScanStatus(status);
    },
  );

  // One hand-off per scan: extraction done → stop the spinner, open the
  // results when there are lines to show, and tell the place page once the
  // whole pipeline has settled.
  const handledRef = useRef<{ opened: string | null }>({ opened: null });
  const processingStatus = progress?.processingStatus ?? null;
  const matchStatus = progress?.matchStatus ?? null;
  useEffect(() => {
    if (!scanId || processingStatus === null || matchStatus === null) return;
    const now = { processingStatus, matchStatus };
    if (isExtractionDone(now)) setIsScanning(false);
    if (opensResults && handledRef.current.opened !== scanId) {
      handledRef.current.opened = scanId;
      router.push(`/map/scans/${scanId}`);
    }
    if (isScanSettled(now) && settledRef.current !== scanId) {
      settledRef.current = scanId;
      onScanComplete?.();
    }
  }, [
    scanId,
    processingStatus,
    matchStatus,
    opensResults,
    router,
    onScanComplete,
  ]);

  const startScan = async (file: File) => {
    setIsScanning(true);
    setScanStatus(null);
    setScanId(null);
    setUploadError(null);

    const result = await uploadAndProcessMenuScan(file, placeId);

    if (result.success && result.scanId) {
      setScanId(result.scanId);
      setScanStatus({
        id: result.scanId,
        processing_status: "pending",
        match_status: "waiting",
        items_detected: null,
        items_matched: null,
        confidence_score: null,
        processing_error: null,
        place_id: placeId,
      });
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
    setShowCamera(false);

    const file = dataUrlToFile(imageDataUrl, `menu-scan-${Date.now()}.jpg`);

    setSelectedFile(file);
    setPreviewUrl(imageDataUrl);
    await startScan(file);
  };

  const handleStartScan = async () => {
    if (!selectedFile) return;
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
                  position: "relative",
                  minHeight: 200,
                }}
              >
                {/* biome-ignore lint/performance/noImgElement: a local blob: preview of the chosen photo; nothing for /_next/image to optimise. */}
                <img
                  src={previewUrl}
                  alt="Menu preview"
                  width={400}
                  height={300}
                  style={{
                    width: "100%",
                    height: "auto",
                    borderRadius: "var(--joy-radius-md)",
                  }}
                />
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
                {PHASES.map((step, index) => {
                  const current = PHASES.indexOf(
                    processingStep as (typeof PHASES)[number],
                  );
                  return (
                    <Chip
                      key={step}
                      size="sm"
                      variant={processingStep === step ? "solid" : "outlined"}
                      color={
                        processingStep === step
                          ? "primary"
                          : index < current
                            ? "success"
                            : "neutral"
                      }
                    >
                      {PHASE_CHIPS[step]}
                    </Chip>
                  );
                })}
              </Stack>
              <Typography
                level="body-sm"
                aria-live="polite"
                sx={{ textAlign: "center", color: "text.secondary" }}
              >
                {PHASE_LABELS[processingStep] ||
                  "Processing your menu image..."}
              </Typography>
              {gaveUp && (
                <Alert
                  color="warning"
                  size="sm"
                  sx={{ flexWrap: "wrap", rowGap: 1 }}
                  endDecorator={
                    <Button size="sm" variant="soft" onClick={restart}>
                      Check again
                    </Button>
                  }
                >
                  This is taking longer than usual.
                </Alert>
              )}
            </Stack>
          )}

          {showResult && (
            <Stack spacing={2}>
              {uploadError ? (
                <Alert color="danger" startDecorator={<MdError />}>
                  <Typography level="title-sm">Upload Failed</Typography>
                  <Typography level="body-sm">{uploadError}</Typography>
                </Alert>
              ) : opensResults ? (
                <Alert color="success" startDecorator={<MdCheckCircle />}>
                  <Typography level="body-sm">
                    Read {scanStatus?.items_detected ?? 0}{" "}
                    {scanStatus?.items_detected === 1 ? "line" : "lines"}.
                    Opening the results...
                  </Typography>
                </Alert>
              ) : isComplete ? (
                <Alert color="neutral" startDecorator={<MdError />}>
                  <Stack spacing={1}>
                    <Typography level="title-sm">No drinks found</Typography>
                    <Typography level="body-sm">
                      We couldn&apos;t read any menu lines in this photo. Try a
                      closer, well-lit shot of the drinks list.
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
                {opensResults && scanId && (
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
                <CameraCapture
                  onCapture={handleCameraCapture}
                  showLibrary={false}
                />
              </Box>
            </Stack>
          </DialogContent>
        </ModalDialog>
      </Modal>
    </Stack>
  );
}
