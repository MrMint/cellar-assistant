import { ImageResponse } from "next/og";
import {
  RECAP_IMAGE_SIZE,
  RecapShareCard,
} from "@/components/recap/RecapShareCard";
import { RecapQuery, recapFromResult } from "@/components/recap/recap-data";
import { handleRecapImage } from "@/components/recap/recap-image";
import { apiServerQuery } from "@/lib/api/urql-server";
import { getOptionalServerUser } from "@/utilities/auth-server";

/**
 * `GET /api/recap/<owner>/<period>/<card>?tz=` — one recap card as a PNG, for
 * the owner to share as a file (L04, L16). Served only to the signed-in owner;
 * every refusal is the same 404 (`recap-image.ts`). Rendered per request and
 * never cached: it is private data, not a public asset.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  {
    params,
  }: { params: Promise<{ owner: string; period: string; card: string }> },
): Promise<Response> {
  const { owner, period, card } = await params;
  return handleRecapImage(
    {
      owner,
      period,
      card,
      timeZone: new URL(request.url).searchParams.get("tz"),
    },
    {
      viewerId: async () => (await getOptionalServerUser())?.id ?? null,
      loadRecap: async (p, timeZone) =>
        recapFromResult(
          await apiServerQuery(RecapQuery, { period: p, timeZone }),
        ),
      render: (data, parsed) =>
        new ImageResponse(
          <RecapShareCard card={data} period={parsed} />,
          RECAP_IMAGE_SIZE,
        ),
    },
  );
}
