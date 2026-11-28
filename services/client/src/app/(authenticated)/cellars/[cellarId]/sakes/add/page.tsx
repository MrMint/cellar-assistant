import type { Metadata } from "next";
import { PinnedCellarCapture } from "@/components/capture/PinnedCellarCapture";

export const metadata: Metadata = { title: "Add a sake" };

/**
 * `/cellars/[cellarId]/sakes/add` — `82450ad1`'s `AddSake`: the capture
 * surface with the cellar pinned and the type fixed, so the item is filed as
 * a bottle (with its display photo) once it exists. The cellar is read first
 * (`PinnedCellarCapture`), so the success sheet names it.
 */
export const dynamic = "force-dynamic";

export default async function AddSake({
  params,
  searchParams,
}: {
  params: Promise<{ cellarId: string }>;
  searchParams: Promise<{ draft?: string | string[] }>;
}) {
  const { cellarId } = await params;
  const { draft } = await searchParams;

  return <PinnedCellarCapture cellarId={cellarId} type="SAKE" draft={draft} />;
}
