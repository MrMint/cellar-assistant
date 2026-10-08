import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { GetCellarInfoQuery } from "@/components/cellar/fragments";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";

/**
 * D24's 404 for `/cellars/[cellarId]/items` and everything under it.
 *
 * The page calls `notFound()` too, but it renders inside this segment's
 * `loading.tsx` boundary, which streams — by the time the page throws, the
 * response has gone out as a 200 (the UX lane, 2026-10-08: a private, missing
 * or malformed cellar's items page answered 200 with the generic title, where
 * `/cellars/<id>` answered 404). A layout renders outside its own segment's
 * loading boundary, so a `notFound()` here is a real 404. The page asks the
 * same query again, which the per-request client answers from its cache.
 */
export default async function CellarItemsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ cellarId: string }>;
}) {
  const { cellarId } = await params;
  const data = await apiServerQuery(GetCellarInfoQuery, { cellarId });
  const result = unwrapResult(data.cellar, "Cellar");
  // §1.6: "no such cellar" and "not yours to see" are one answer. Any other
  // failure is the page's to report.
  if (!result.ok && isNotFound(result.error)) notFound();
  return children;
}
