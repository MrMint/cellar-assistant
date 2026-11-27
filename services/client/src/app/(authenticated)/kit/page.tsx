import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { KitGallery } from "@/components/app/kit-gallery";
import { Page } from "@/components/app/Page";
import { kitPageEnabled } from "./enabled";

export const metadata: Metadata = {
  title: "Kit",
  robots: { index: false, follow: false },
};

/**
 * `/kit`: every content part in its states, dark and light, plus the overlay
 * gallery when it exists. `connection()` first, so the flag is read per
 * request and never baked into a prerender; then a 404 unless
 * `CELLAR_KIT_PAGE=1`.
 */
export default async function KitPage() {
  await connection();
  if (!kitPageEnabled()) notFound();
  return (
    <Page>
      <KitGallery />
    </Page>
  );
}
