/**
 * L04 / L16 — the share-image route's decision, apart from Next and Satori so
 * it is testable: `GET /api/recap/<owner>/<period>/<card>?tz=` serves the
 * image only to the signed-in owner.
 *
 * Every refusal is the **same** response — anonymous, another signed-in user,
 * a malformed or missing period, a card index past the deck, a recap the API
 * would not serve — so the route is not an oracle for whose recap exists or
 * which cards it has (L6). The image is `private, no-store`: it is the
 * owner's, fetched to be shared as a file, and never a cacheable public URL.
 */
import {
  normaliseRecapTimeZone,
  parseRecapPeriod,
  type RecapPeriod,
} from "@cellar-assistant/contracts/recap";
import { type RecapData, type RecapShareFace, shareFaceAt } from "./recap-data";

export type RecapImageRequest = {
  readonly owner: string;
  readonly period: string | undefined;
  readonly card: string | undefined;
  readonly timeZone: string | null;
};

export type RecapImageDeps = {
  /** The signed-in viewer's id, or `null`. */
  readonly viewerId: () => Promise<string | null>;
  /** The viewer's recap, read as the viewer; `null` on any refusal. */
  readonly loadRecap: (
    period: string,
    timeZone: string,
  ) => Promise<RecapData | null>;
  /** Draws a card of the deck, or its end card (index = deck length). */
  readonly render: (
    face: RecapShareFace,
    period: RecapPeriod,
  ) => Response | Promise<Response>;
};

export const PRIVATE_NO_STORE = "private, no-store, max-age=0";

/** The one refusal, whatever the reason. */
export const recapImageRefusal = (): Response =>
  new Response("Not found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": PRIVATE_NO_STORE,
    },
  });

const CARD_INDEX = /^(0|[1-9]\d{0,2})$/;

export const handleRecapImage = async (
  request: RecapImageRequest,
  deps: RecapImageDeps,
): Promise<Response> => {
  const period = parseRecapPeriod(request.period);
  const timeZone = normaliseRecapTimeZone(request.timeZone);
  const index =
    request.card !== undefined && CARD_INDEX.test(request.card)
      ? Number(request.card)
      : null;
  if (period === null || timeZone === null || index === null) {
    return recapImageRefusal();
  }
  let viewer: string | null;
  try {
    viewer = await deps.viewerId();
  } catch {
    return recapImageRefusal();
  }
  if (viewer === null || viewer !== request.owner) return recapImageRefusal();
  let recap: RecapData | null;
  try {
    recap = await deps.loadRecap(request.period ?? "", timeZone);
  } catch {
    return recapImageRefusal();
  }
  const card = recap === null ? undefined : shareFaceAt(recap, index);
  if (card === undefined) return recapImageRefusal();
  const response = await deps.render(card, period);
  response.headers.set("cache-control", PRIVATE_NO_STORE);
  return response;
};
