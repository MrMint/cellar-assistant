import { notFound } from "next/navigation";
import { AddItemClient } from "@/components/cellar/AddItemClient";
import { canAddToCellar } from "@/components/cellar/adapter";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { ItemOnboarding } from "@/components/common/OnboardingWizard/ItemOnboarding";
import {
  CellarCardFragment,
  CellarHeaderQuery,
  ViewerQuery,
} from "@/lib/api/cellars";
import { readFragment } from "@/lib/api/graphql";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { draftIdFrom } from "@/lib/capture/draft-store";
import { CaptureClose } from "./CaptureChrome";

/**
 * A cellar's own add pages — `/cellars/[id]/items/add` (the type picked on
 * the page, last used first) and the six per-type routes
 * (`/cellars/[id]/wines/add`, the type fixed) — as one server component.
 *
 * Every one of them reads the cellar first, so the success sheet says
 * "… is in Home Cellar" rather than "… is in your cellar" (X05's per-type
 * routes never had the name), a cellar that does not exist is a 404, and a
 * viewer who may not add here gets the old note instead of a camera. Close
 * goes back to the cellar on a cold open.
 */
export async function PinnedCellarCapture({
  cellarId,
  type,
  chooseType = false,
  typeExplicit = false,
  draft,
}: {
  cellarId: string;
  type: ApiItemType;
  /** `/items/add`: the person picks the type. */
  chooseType?: boolean;
  /** `type` came from `?type=`, so the last used does not replace it. */
  typeExplicit?: boolean;
  /** `?draft=`, as given. */
  draft?: string | string[];
}) {
  const [header, viewer] = await Promise.all([
    apiServerQuery(CellarHeaderQuery, { cellarId }),
    apiServerQuery(ViewerQuery, {}),
  ]);

  const result = unwrapResult(header.cellar, "Cellar");
  if (!result.ok) {
    if (isNotFound(result.error)) notFound();
    return (
      <p role="alert" className="t-body text-destructive">
        {result.error.message}
      </p>
    );
  }
  const cellar = readFragment(CellarCardFragment, result.data);

  if (!canAddToCellar(cellar, viewer.me?.id ?? null)) {
    // The old page's note, with inert cards: nothing here can be filed.
    return (
      <AddItemClient
        cellarId={cellarId}
        cellarName={cellar.name}
        canAdd={false}
      />
    );
  }
  return (
    <div className="mx-auto w-full max-w-[600px]">
      <ItemOnboarding
        type={type}
        typeExplicit={typeExplicit}
        chooseType={chooseType}
        cellarId={cellarId}
        cellarName={cellar.name}
        resumeId={draftIdFrom(typeof draft === "string" ? draft : undefined)}
        leading={<CaptureClose fallbackHref={`/cellars/${cellarId}`} />}
      />
    </div>
  );
}
