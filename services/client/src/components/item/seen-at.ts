/**
 * L10 (wave C seenat) · the item page's "Seen at": its query and the pure
 * wording, so the board's lines are tested without rendering
 * (`seen-at.test.ts`). Every privacy rule is the server's — this module only
 * says what each row already is.
 */
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql, type ResultOf } from "@/lib/api/graphql";
import { formatDistance } from "@/lib/items/distance";

export const ItemSeenAtQuery = graphql(
  `
  query ItemSeenAt($id: ID!, $type: ItemType!, $near: LngLatInput) {
    item(id: $id, type: $type) {
      __typename
      ... on QueryItemSuccess {
        data {
          __typename
          id
          seenAt(near: $near, first: 20) {
            totalCount
            edges {
              node {
                place {
                  id
                }
                placeName
                kind
                at
                friendName
                distanceMeters
              }
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

type ItemResult = NonNullable<ResultOf<typeof ItemSeenAtQuery>["item"]>;
type Success = Extract<ItemResult, { __typename: "QueryItemSuccess" }>;
export type SeenAtRow = NonNullable<
  Success["data"]["seenAt"]
>["edges"][number]["node"];

/** The rows out of a result; anything but success is "nothing to show". */
export const seenAtRows = (
  data: ResultOf<typeof ItemSeenAtQuery> | undefined,
): SeenAtRow[] => {
  const item = data?.item;
  if (item?.__typename !== "QueryItemSuccess") return [];
  return item.data.seenAt.edges.map((edge) => edge.node);
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** "Aug" this year, "Aug 2024" otherwise; UTC so server and client agree. */
const monthOf = (iso: string, now: number): string | null => {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const month = MONTHS[at.getUTCMonth()] ?? "";
  return at.getUTCFullYear() === new Date(now).getUTCFullYear()
    ? month
    : `${month} ${at.getUTCFullYear()}`;
};

/** A friend by first name, as the board does ("Maya had it here"). */
const firstName = (name: string | null): string => {
  const first = name?.trim().split(/\s+/)[0];
  return first === undefined || first === "" ? "A friend" : first;
};

/**
 * The second line: why this place is here, and when.
 * `now` is null before mount, when a relative time would not hydrate.
 */
export const seenAtWhy = (row: SeenAtRow, now: number | null): string => {
  if (row.kind === "MENU") {
    const ago =
      row.at === null || now === null ? "" : formatDistance(row.at, now);
    return ago === ""
      ? "On the menu"
      : `On the menu · scanned ${ago === "less than a minute" ? "just now" : `${ago} ago`}`;
  }
  const who = row.kind === "OWN_LOG" ? "You" : firstName(row.friendName);
  const when = row.at === null || now === null ? null : monthOf(row.at, now);
  return when === null ? `${who} had it here` : `${who} had it here · ${when}`;
};

/**
 * "80 m", "110 m", "0.6 km", "12 km"; null without a position. Metres up to
 * half a kilometre (E-9: "0.1 km" for a short walk read worse than "110 m"),
 * then tenths of a km as the SeenAt board's "0.6 km".
 */
export const seenAtDistance = (meters: number | null): string | null => {
  if (meters === null || !Number.isFinite(meters) || meters < 0) return null;
  if (meters < 495) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  if (meters < 10_000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000)} km`;
};

/** Where "Scan a menu" goes: the capture surface's Menu mode. */
export const SCAN_A_MENU_HREF = "/add?mode=menu";

/**
 * What the Seen at slot shows (W-15, decisions.md): the places and the scan
 * prompt when there are places; the prompt alone when the item has none yet
 * and the viewer can scan a menu — the prompt is the way into scan-anywhere,
 * and an item nobody has seen anywhere is exactly where it is needed; and
 * nothing (M4) while the answer is still coming, when the read failed, or when
 * there is nothing to show and menu scanning is not offered here.
 */
export type SeenAtView = "list" | "prompt" | "none";

export const seenAtView = (
  data: ResultOf<typeof ItemSeenAtQuery> | undefined,
  menuScanOffered: boolean,
): SeenAtView => {
  if (data?.item?.__typename !== "QueryItemSuccess") return "none";
  if (seenAtRows(data).length > 0) return "list";
  return menuScanOffered ? "prompt" : "none";
};
