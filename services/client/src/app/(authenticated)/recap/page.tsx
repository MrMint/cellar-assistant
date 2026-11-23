import type { Metadata } from "next";
import { RecapDeck } from "@/components/recap/RecapDeck";
import { getServerUser } from "@/utilities/auth-server";

export const metadata: Metadata = { title: "Your recap" };
export const dynamic = "force-dynamic";

/**
 * `/recap?period=2026-10` (a month) or `?period=2026` (a year) — the viewer's
 * own recap deck (L04). No period means this month in the viewer's clock, so
 * the deck resolves it in the browser, where the time zone is known. There is
 * no user in the URL: a recap is only ever your own (L16).
 */
export default async function RecapPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const [user, params] = await Promise.all([getServerUser(), searchParams]);
  const period = typeof params.period === "string" ? params.period : null;
  return <RecapDeck ownerId={user.id} period={period} />;
}
