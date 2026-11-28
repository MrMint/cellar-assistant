import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PlaceHeroQuery } from "@/components/map/queries";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";

/**
 * D24's 404 for `/places/[placeId]`, moved here from the page when the page
 * gained a streaming `loading.tsx` (X24): a layout renders outside its own
 * segment's loading boundary, so a `notFound()` here is a real 404, where the
 * page's would now arrive inside an already-sent 200 (the same move as
 * `cellars/[cellarId]/items/layout.tsx`). The page asks the same query for
 * the hero, which the per-request client answers from its cache.
 */
export default async function PlaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ placeId: string }>;
}) {
  const { placeId } = await params;
  if (!placeId) notFound();

  const { place } = await apiServerQuery(PlaceHeroQuery, { id: placeId });
  const result = unwrapResult(place, "Place");
  // §1.6: "no such place" and "not yours to see" are one answer. Any other
  // failure is `PlaceDetails`'s to report, as before.
  if (!result.ok && isNotFound(result.error)) notFound();
  return children;
}
