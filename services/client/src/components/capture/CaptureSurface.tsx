"use client";

import { useEffect, useState } from "react";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { ItemOnboarding } from "@/components/common/OnboardingWizard/ItemOnboarding";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type CaptureMode,
  defaultCaptureMode,
  readCapturePrefs,
  rememberCapturePrefs,
} from "@/lib/capture/capture-prefs";
import { photoHandoff } from "@/lib/capture/photo-handoff";
import { ModeRow } from "./add/ModeRow";
import { CaptureClose } from "./CaptureChrome";
import type { AddableCellar } from "./CellarPicker";
import { MenuCapture } from "./MenuCapture";
import { RecipeCapture } from "./RecipeCapture";

export type CaptureSurfaceProps = {
  /** The type a bottle is read as: the route's, or the first default. */
  type: ApiItemType;
  /** `type` came from the entry (`?type=`), so the last used does not replace it. */
  typeExplicit?: boolean;
  /** The mode an entry asked for (`?mode=`), which wins over the last used. */
  mode?: CaptureMode;
  /** The cellars the viewer may add to (the draft card's "Into" row). */
  cellars?: readonly AddableCellar[];
  /** `?draft=<id>`: reopen a bottle's read left running in the background. */
  resumeId?: string;
  /** `?photo=<token>`: a photo carried in (`lib/capture/photo-handoff.ts`). */
  photoToken?: string;
};

type Resolved = { mode: CaptureMode; photo?: string };

/**
 * What ＋ opens (X06): **the camera**, full screen (the tab bar steps aside;
 * Close is the way out), with the mode row Bottle · Menu · Recipe right under
 * the picture. It opens on the mode an entry asked for, else the last one
 * used, else Bottle — never a guess from the picture (D25, no classifier).
 *
 * - **Bottle** is X05's snap-once flow (`ItemOnboarding`): a barcode read off
 *   the live picture, the label read at the shutter, a draft card.
 * - **Menu** scans a menu from anywhere, settling its place with "At …?"
 *   (`MenuCapture`).
 * - **Recipe** reads a recipe photo into a draft recipe (`RecipeCapture`).
 *
 * A photo can cross between them without being taken again: a label read
 * that says "menu" switches to Menu with the same photo, and a photo carried
 * in from elsewhere (photo search's fallback) opens in its mode's preview.
 *
 * The mode and a carried photo live in this browser only (the last mode in
 * `capture-prefs`, the photo in memory), so they are settled after mount and
 * no camera starts before they are: a remembered Menu must not open the
 * Bottle camera for a frame first.
 */
export function CaptureSurface({
  type,
  typeExplicit = false,
  mode: explicitMode,
  cellars,
  resumeId,
  photoToken,
}: CaptureSurfaceProps) {
  const [resolved, setResolved] = useState<Resolved | null>(null);
  // Each switch, and each carried photo, starts its mode fresh.
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (resolved !== null) return;
    const photo =
      photoToken === undefined ? undefined : photoHandoff.take(photoToken);
    setResolved({
      // A draft to resume is a bottle's, whatever was used last.
      mode:
        resumeId !== undefined
          ? "bottle"
          : defaultCaptureMode(explicitMode, readCapturePrefs()),
      ...(photo === undefined ? {} : { photo }),
    });
  }, [resolved, photoToken, resumeId, explicitMode]);

  const switchTo = (mode: CaptureMode, photo?: string) => {
    rememberCapturePrefs({ mode });
    setResolved({ mode, ...(photo === undefined ? {} : { photo }) });
    setRun((n) => n + 1);
  };

  const leading = <CaptureClose />;

  if (resolved === null) {
    return (
      <div data-slot="capture-surface" className="flex flex-col gap-3">
        <div className="flex min-h-11 items-center gap-1">{leading}</div>
        <Skeleton className="aspect-[3/4] max-h-[64dvh] w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-md" />
      </div>
    );
  }

  const modeRow = (
    <ModeRow value={resolved.mode} onValueChange={(next) => switchTo(next)} />
  );

  return (
    <div
      data-slot="capture-surface"
      data-mode={resolved.mode}
      className="mx-auto w-full max-w-[600px]"
    >
      {resolved.mode === "bottle" ? (
        <ItemOnboarding
          key={run}
          type={type}
          typeExplicit={typeExplicit}
          chooseType
          cellars={cellars}
          resumeId={run === 0 ? resumeId : undefined}
          leading={leading}
          modeRow={modeRow}
          initialPhoto={resolved.photo}
          onScanAsMenu={(photo) => switchTo("menu", photo)}
        />
      ) : resolved.mode === "menu" ? (
        <MenuCapture
          key={run}
          leading={leading}
          modeRow={modeRow}
          initialPhoto={resolved.photo}
        />
      ) : (
        <RecipeCapture
          key={run}
          leading={leading}
          modeRow={modeRow}
          initialPhoto={resolved.photo}
        />
      )}
    </div>
  );
}
