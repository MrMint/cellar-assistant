import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AddItemClient } from "@/components/cellar/AddItemClient";
import { canAddToCellar } from "@/components/cellar/adapter";
import {
  type ApiItemType,
  ITEM_TYPES,
} from "@/components/cellar-api/itemTypes";
import { ItemOnboarding } from "@/components/common/OnboardingWizard/ItemOnboarding";
import {
  CellarCardFragment,
  CellarHeaderQuery,
  ViewerQuery,
} from "@/lib/api/cellars";
import { readFragment } from "@/lib/api/graphql";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";

export const metadata: Metadata = { title: "Add a bottle" };

/**
 * `/cellars/[cellarId]/items/add` — the capture surface (X05) filing into
 * this cellar: one camera, the type defaulted to the last used. A viewer who
 * may not add here gets the old `AddItemClient` note instead.
 */
export const dynamic = "force-dynamic";

export default async function Add({
  params,
  searchParams,
}: {
  params: Promise<{ cellarId: string }>;
  searchParams: Promise<{
    draft?: string | string[];
    type?: string | string[];
  }>;
}) {
  const { cellarId } = await params;
  const [header, viewer] = await Promise.all([
    apiServerQuery(CellarHeaderQuery, { cellarId }),
    apiServerQuery(ViewerQuery, {}),
  ]);

  const result = unwrapResult(header.cellar, "Cellar");
  if (!result.ok) {
    if (isNotFound(result.error)) notFound();
    return (
      <p role="alert" className="type-body text-destructive">
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
  const { draft, type } = await searchParams;
  const explicit =
    typeof type === "string" &&
    (ITEM_TYPES as readonly string[]).includes(type);
  return (
    <ItemOnboarding
      type={explicit ? (type as ApiItemType) : "WINE"}
      typeExplicit={explicit}
      chooseType
      cellarId={cellarId}
      cellarName={cellar.name}
      resumeId={typeof draft === "string" ? draft : undefined}
    />
  );
}
