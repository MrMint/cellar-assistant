import { redirect } from "next/navigation";

/**
 * `/cellars/[cellarId]` — the old overview ("Open and recent", Check in, the
 * check-in history), merged into the cellar home at `/items` (X04, decision
 * D3: "merge it into the cellar page, and make the top a dashboard"). Kept as
 * a redirect so links and bookmarks to it land on the merged page; the
 * `items` layout answers a private or missing cellar with the 404.
 */
export default async function CellarPage({
  params,
}: {
  params: Promise<{ cellarId: string }>;
}) {
  const { cellarId } = await params;
  redirect(`/cellars/${encodeURIComponent(cellarId)}/items`);
}
