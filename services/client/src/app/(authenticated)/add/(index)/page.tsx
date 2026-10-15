import type { Metadata } from "next";
import { loadAddableCellars } from "@/components/capture/addable-cellars";
import { CaptureSurface } from "@/components/capture/CaptureSurface";
import {
  type ApiItemType,
  ITEM_TYPES,
} from "@/components/cellar-api/itemTypes";
import { CAPTURE_MODES, type CaptureMode } from "@/lib/capture/capture-prefs";
import { draftIdFrom } from "@/lib/capture/draft-store";
import { photoTokenFrom } from "@/lib/capture/photo-handoff";

export const metadata: Metadata = { title: "Add a bottle" };

/**
 * `/add` — the capture surface behind ＋ (X06): the camera, full screen, with
 * Bottle · Menu · Recipe opening on the last mode used. `?mode=` and `?type=`
 * are an entry's explicit asks; `?draft=` reopens a bottle's read left
 * running in the background; `?photo=` carries in a photo taken elsewhere
 * (photo search's fallback, a label read that said "menu").
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
    <CaptureSurface
      type={explicit ? (type as ApiItemType) : "WINE"}
      typeExplicit={explicit}
      mode={
        mode !== undefined &&
        (CAPTURE_MODES as readonly string[]).includes(mode)
          ? (mode as CaptureMode)
          : undefined
      }
      cellars={cellars}
      resumeId={draftIdFrom(one(params.draft))}
      photoToken={photoTokenFrom(params.photo)}
    />
  );
}
