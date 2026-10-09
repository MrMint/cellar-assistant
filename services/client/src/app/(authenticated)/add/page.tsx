import type { Metadata } from "next";
import { loadAddableCellars } from "@/components/capture/addable-cellars";
import {
  type ApiItemType,
  ITEM_TYPES,
} from "@/components/cellar-api/itemTypes";
import { ItemOnboarding } from "@/components/common/OnboardingWizard/ItemOnboarding";
import { CAPTURE_MODES, type CaptureMode } from "@/lib/capture/capture-prefs";

export const metadata: Metadata = { title: "Add a bottle" };

/**
 * `/add` — the capture surface (X05): one camera, the type and the cellar
 * defaulted to the last used (no classifier call), and Bottle · Menu ·
 * Recipe. `?mode=` and `?type=` are an entry's explicit asks (the ＋
 * chooser's Bottle row passes `mode=bottle`); `?draft=` reopens a read left
 * running in the background.
 */
export const dynamic = "force-dynamic";

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export default async function AddPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const type = one(params.type);
  const mode = one(params.mode);
  const cellars = await loadAddableCellars();
  const explicit =
    type !== undefined && (ITEM_TYPES as readonly string[]).includes(type);
  return (
    <ItemOnboarding
      type={explicit ? (type as ApiItemType) : "WINE"}
      typeExplicit={explicit}
      chooseType
      showModes
      mode={
        mode !== undefined &&
        (CAPTURE_MODES as readonly string[]).includes(mode)
          ? (mode as CaptureMode)
          : undefined
      }
      cellars={cellars}
      resumeId={one(params.draft)}
    />
  );
}
