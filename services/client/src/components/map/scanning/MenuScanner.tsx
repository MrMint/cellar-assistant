"use client";

/**
 * The place page's "Scan a menu" (Places-Place 07, 08): a sheet with Take a
 * photo / Choose a photo, then the progress in the Menu card itself (the
 * `ScanSteps` card), then the results page once lines are read.
 *
 * `uploadAndProcessMenuScan(formData)` (a server action that uploaded the
 * photo and fired `processMenuScan` with a webhook secret) →
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

import { type ReactNode, useEffect, useRef, useState } from "react";
import { BottomSheet } from "@/components/app/BottomSheet";
import { Camera, ICON_STROKE, PhotoLibrary } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { useNavigate } from "@/components/app/useNavigate";
import { kickAiJobs } from "@/components/home/ai-job-store";
import { Button } from "@/components/ui/button";
import { feedback } from "@/lib/feedback";
import { CameraCapture } from "../../common/CameraCapture";
import { type MenuScanStatus, usePlaceActions } from "../actions";
import { ScanSteps } from "./ScanSteps";
import {
  isExtractionDone,
  isScanSettled,
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
  /**
   * What the card shows while no scan is running: given `start`, which opens
   * the Take a photo / Choose a photo sheet.
   */
  idle: (start: () => void) => ReactNode;
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

/** A sheet row: glyph and words, 56 tall (Places-Place 07). */
function SheetRow({
  icon: Icon,
  onSelect,
  children,
}: {
  icon: typeof Camera;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        feedback("tick");
        onSelect();
      }}
      className="t-body flex min-h-14 w-full items-center gap-4 rounded-lg px-2 text-left text-ink outline-none transition-transform duration-(--ca-dur-micro) focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[.97]"
    >
      <Icon
        aria-hidden
        strokeWidth={ICON_STROKE}
        className="size-5 shrink-0 text-glyph"
      />
      {children}
    </button>
  );
}

export function MenuScanner({
  placeId,
  onScanComplete,
  idle,
}: MenuScannerProps) {
  const navigate = useNavigate();
  const { getMenuScanStatus, uploadAndProcessMenuScan } = usePlaceActions();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<MenuScanStatus | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const settledRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const progress = progressOf(scanStatus);
  const phase = scanPhase(progress);
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
  const { gaveUp } = usePollWhile(
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
      feedback("success");
      navigate.push(`/map/scans/${scanId}`);
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
    navigate,
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
      // X10: the shell's watcher follows the scan from here, so leaving this
      // page still ends in a "menu is read" toast, and Home's tray shows it.
      kickAiJobs();
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
      feedback("refuse");
      setUploadError(result.error || "The photo didn't send.");
      setIsScanning(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void startScan(file);
  };

  const handleCameraCapture = async (imageDataUrl: string) => {
    setShowCamera(false);
    await startScan(dataUrlToFile(imageDataUrl, `menu-scan-${Date.now()}.jpg`));
  };

  const handleReset = () => {
    setScanId(null);
    setScanStatus(null);
    setUploadError(null);
  };

  const start = () => setSheetOpen(true);
  const running = isScanning && !isComplete && !isFailed;

  return (
    <div data-slot="menu-scanner" className="flex flex-col gap-3">
      {running ? (
        <ScanSteps phase={phase} slow={gaveUp} className="bg-transparent p-0" />
      ) : uploadError || isFailed ? (
        <div role="alert" className="flex flex-col gap-3">
          <p className="t-head text-ink">Couldn&apos;t read this menu</p>
          <p className="t-cap text-ink-2">
            {uploadError ??
              scanStatus?.processing_error ??
              "Try a sharper photo, closer in."}
          </p>
          <Button variant="outline" className="self-start" onClick={start}>
            <Camera aria-hidden />
            Try again
          </Button>
        </div>
      ) : opensResults && scanId ? (
        <div className="flex items-center justify-between gap-3">
          <p className="t-body text-ink">
            Read {scanStatus?.items_detected ?? 0}{" "}
            {scanStatus?.items_detected === 1 ? "line" : "lines"}
          </p>
          <Button variant="outline" asChild>
            <Link href={`/map/scans/${scanId}`} underline="none">
              See the lines
            </Link>
          </Button>
        </div>
      ) : isComplete ? (
        <div className="flex flex-col gap-3">
          <p className="t-head text-ink">No drinks on this photo</p>
          <Button
            variant="outline"
            className="self-start"
            onClick={() => {
              handleReset();
              start();
            }}
          >
            <Camera aria-hidden />
            Try another photo
          </Button>
        </div>
      ) : (
        idle(start)
      )}

      <input
        ref={fileInputRef}
        id="camera-file-input"
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Scan a menu"
      >
        <div className="flex flex-col pb-4">
          <SheetRow
            icon={Camera}
            onSelect={() => {
              setSheetOpen(false);
              setShowCamera(true);
            }}
          >
            Take a photo
          </SheetRow>
          <SheetRow
            icon={PhotoLibrary}
            onSelect={() => {
              setSheetOpen(false);
              fileInputRef.current?.click();
            }}
          >
            Choose a photo
          </SheetRow>
        </div>
      </BottomSheet>

      {/* Camera sheet (a dialog from md) */}
      <ResponsiveDialog
        open={showCamera}
        onOpenChange={setShowCamera}
        title="Scan a menu"
        description="The drinks list, flat and well lit."
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
