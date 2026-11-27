import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { brandsRedirectHref } from "@/components/brand/redirect";

/**
 * `/brands` — there is no brand index any more (L37, 40f): makers are found
 * through search, so this opens `/search` with the Brands section, carrying
 * the old `?q=` term. A brand's own page stays at `/brands/[brandId]`.
 */
export const metadata: Metadata = { title: "Brands" };

export const dynamic = "force-dynamic";

export default async function BrandsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { q } = await searchParams;
  redirect(brandsRedirectHref(q));
}
