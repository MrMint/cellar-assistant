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

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Camera,
  ErrorIcon,
  PhotoLibrary,
  Success,
  Visible,
  Warning,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CameraCapture } from "../../common/CameraCapture";
import { type MenuScanStatus, usePlaceActions } from "../actions";
import { ScanProgressBar } from "./ScanProgressBar";
import { ScanStatusBadge } from "./ScanStatusBadge";
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    <div className="flex flex-col gap-6">
      <section className="rounded-xl bg-surface-1 p-4">
        <h2 className="type-title-2 mb-4">Scan Menu with Camera</h2>

        <p className="type-body mb-6 text-ink-2">
          Photograph the drinks menu and we&apos;ll read each line — wine, beer,
          spirits, cocktails, sake, tea and coffee — and match it to the
          catalog.
        </p>

        {showCaptureButtons && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-row gap-4">
              <Button size="lg" onClick={() => setShowCamera(true)}>
                <Camera aria-hidden />
                Take Photo
              </Button>

              <Button
                variant="outline"
                size="lg"
                onClick={() => fileInputRef.current?.click()}
              >
                <PhotoLibrary aria-hidden />
                Choose File
              </Button>
              <input
                ref={fileInputRef}
                id="camera-file-input"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            <p className="type-footnote text-ink-2">
              Best results with clear, well-lit photos. Make sure the text is
              readable.
            </p>
          </div>
        )}

        {showPreview && (
          <div className="flex flex-col gap-6">
            <div className="relative mx-auto min-h-[200px] w-full max-w-[400px]">
              {/* biome-ignore lint/performance/noImgElement: a local blob: preview of the chosen photo; nothing for /_next/image to optimise. */}
              <img
                src={previewUrl}
                alt="Menu preview"
                width={400}
                height={300}
                className="h-auto w-full rounded-md"
              />
            </div>

            <p className="type-callout text-center">
              <strong>{selectedFile.name}</strong> (
              {(selectedFile.size / 1024 / 1024).toFixed(1)} MB)
            </p>

            <div className="flex flex-row justify-center gap-4">
              <Button
                size="lg"
                onClick={handleStartScan}
                disabled={isScanning}
                aria-busy={isScanning}
              >
                {isScanning && <Spinner />}
                Scan Menu
              </Button>

              <Button
                variant="outline"
                onClick={handleReset}
                disabled={isScanning}
              >
                Choose Different Photo
              </Button>
            </div>
          </div>
        )}

        {showProcessing && (
          <div className="flex flex-col gap-4">
            <ScanProgressBar label="Scanning the menu" />
            <div className="flex flex-row items-center justify-center gap-2">
              {PHASES.map((step, index) => {
                const current = PHASES.indexOf(
                  processingStep as (typeof PHASES)[number],
                );
                return (
                  <ScanStatusBadge
                    key={step}
                    tone={
                      processingStep === step
                        ? "working"
                        : index < current
                          ? "success"
                          : "neutral"
                    }
                    aria-current={processingStep === step ? "step" : undefined}
                  >
                    {PHASE_CHIPS[step]}
                  </ScanStatusBadge>
                );
              })}
            </div>
            <p
              aria-live="polite"
              className="type-callout text-center text-ink-2"
            >
              {PHASE_LABELS[processingStep] || "Processing your menu image..."}
            </p>
            {gaveUp && (
              <Alert className="flex flex-wrap items-center justify-between gap-2 bg-surface-2">
                <span className="type-callout flex items-center gap-2">
                  <Warning aria-hidden className="size-4 shrink-0" />
                  This is taking longer than usual.
                </span>
                <Button variant="secondary" size="sm" onClick={restart}>
                  Check again
                </Button>
              </Alert>
            )}
          </div>
        )}

        {showResult && (
          <div className="flex flex-col gap-4">
            {uploadError ? (
              <Alert variant="destructive" className="border-destructive/60">
                <ErrorIcon aria-hidden />
                <AlertTitle>Upload Failed</AlertTitle>
                <AlertDescription className="text-destructive/90">
                  {uploadError}
                </AlertDescription>
              </Alert>
            ) : opensResults ? (
              <Alert className="border-success/40 text-success">
                <Success aria-hidden />
                <AlertDescription className="text-success">
                  Read {scanStatus?.items_detected ?? 0}{" "}
                  {scanStatus?.items_detected === 1 ? "line" : "lines"}. Opening
                  the results...
                </AlertDescription>
              </Alert>
            ) : isComplete ? (
              <Alert className="bg-surface-2">
                <ErrorIcon aria-hidden />
                <AlertTitle>No drinks found</AlertTitle>
                <AlertDescription className="text-ink-2">
                  We couldn&apos;t read any menu lines in this photo. Try a
                  closer, well-lit shot of the drinks list.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive" className="border-destructive/60">
                <ErrorIcon aria-hidden />
                <AlertTitle>Scan Failed</AlertTitle>
                <AlertDescription className="text-destructive/90">
                  {scanStatus?.processing_error ||
                    "Failed to process the menu image."}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-row justify-center gap-4">
              {opensResults && scanId && (
                <Button asChild>
                  <Link href={`/map/scans/${scanId}`} underline="none">
                    <Visible aria-hidden />
                    View Results
                  </Link>
                </Button>
              )}

              <Button variant="outline" onClick={handleReset}>
                Scan Another Menu
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl bg-surface-1 p-4">
        <h3 className="type-headline mb-4">Tips for Better Results</h3>
        <div className="flex flex-col gap-2">
          <p className="type-callout">
            Ensure the menu text is clear and well-lit
          </p>
          <p className="type-callout">Hold the camera steady to avoid blur</p>
          <p className="type-callout">
            Take multiple photos if the menu spans several pages
          </p>
          <p className="type-callout">
            Focus on beverage sections (wine list, beer menu, cocktails)
          </p>
        </div>
      </section>

      {/* Camera sheet (a dialog from md) */}
      <ResponsiveDialog
        open={showCamera}
        onOpenChange={setShowCamera}
        title="Scan Menu"
        description="Position the menu clearly in the frame and tap the capture button."
        className="sm:max-w-[600px]"
      >
        <div className="h-[400px]">
          {showCamera && (
            <CameraCapture
              onCapture={handleCameraCapture}
              showLibrary={false}
            />
          )}
        </div>
      </ResponsiveDialog>
    </div>
  );
}
