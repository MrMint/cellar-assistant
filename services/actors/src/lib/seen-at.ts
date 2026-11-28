/**
 * L10 (wave C seenat) · an item's "Seen at": the places it was seen on a
 * scanned menu or logged at, **as far as the viewer may see them**.
 *
 * Privacy composes the existing rules in `@cellar-assistant/policy` (L6, L28)
 * and adds none of its own:
 *
 * - every place passes `canSeePlace` — an approved place is everyone's, a
 *   pending or rejected one is its creator's alone (D28);
 * - a menu sighting is a matched `place_menu_items` line: shared place data,
 *   so the place rule is the whole gate (who scanned it is never said);
 * - a log sighting is `check_ins.place_id`, which is one of a log's *details*,
 *   so it passes `canSeeCheckInDetails` (the owner, a friend of the drinker, a
 *   companion on the same outing) — never the weaker `canSeeCheckIn`, which a
 *   public cellar's viewer passes.
 *
 * A sighting the viewer may not see is omitted, never refused, so the answer
 * for a missing item, an item seen only at a private place, and an item logged
 * only by a stranger is the same empty list: none of them is an oracle.
 *
 * `selectSeenAt` is the pure half — the rule, tested without a database —
 * and `loadSeenAt` the read that feeds it.
 */
import type {
  Ctx,
  ItemRef,
  SeenAtDto,
  SeenAtInput,
  SeenAtKind,
} from "@cellar-assistant/contracts";
import { SEEN_AT_KINDS, SEEN_AT_MAX } from "@cellar-assistant/contracts";
import {
  checkIns,
  menuScans,
  placeMenuItems,
  places,
  user,
} from "@cellar-assistant/db";
import { and, eq, inArray, isNotNull, or, sql } from "@cellar-assistant/db/orm";
import type { Friendship, PlaceVisibility } from "@cellar-assistant/policy";
import {
  canSeeCheckInDetails,
  canSeePlace,
  isFriend,
} from "@cellar-assistant/policy";
import type { DbOrTx } from "./db.ts";
import { ARCS } from "./item-arcs.ts";
import { friendIdsOf, friendshipsOf } from "./visibility.ts";

export type SeenAtSighting =
  | {
      readonly kind: "menu";
      readonly placeId: string;
      readonly at: Date | null;
    }
  | {
      readonly kind: "log";
      readonly placeId: string;
      /** `check_ins.user_id`. */
      readonly userId: string | null;
      readonly groupId: string;
      readonly at: Date | null;
    };

export type SeenAtPlaceFacts = PlaceVisibility & {
  readonly id: string;
  readonly name: string;
  readonly distanceMeters: number | null;
};

export type SeenAtFacts = {
  readonly sightings: readonly SeenAtSighting[];
  readonly places: ReadonlyMap<string, SeenAtPlaceFacts>;
  readonly friendships: readonly Friendship[];
  /** `check_ins.group_id`s the viewer has a log in: companions (X02). */
  readonly viewerGroupIds: ReadonlySet<string>;
  readonly userNames: ReadonlyMap<string, string>;
};

const rank = (kind: SeenAtKind): number => SEEN_AT_KINDS.indexOf(kind);

const time = (at: string | null): number =>
  at === null ? Number.NEGATIVE_INFINITY : Date.parse(at);

/**
 * The rule. One row per visible place, its reason the strongest visible one
 * (`SEEN_AT_KINDS`: your own log, then a menu, then a friend's log), newest
 * within a reason; nearest first when there is a distance, newest otherwise.
 */
export const selectSeenAt = (
  ctx: Ctx,
  facts: SeenAtFacts,
  first: number = SEEN_AT_MAX,
): SeenAtDto[] => {
  const viewer = ctx.viewerId;
  // Signed-in only, as every place read is; the actor refuses earlier.
  if (viewer === null) return [];
  const best = new Map<string, SeenAtDto>();
  for (const sighting of facts.sightings) {
    const place = facts.places.get(sighting.placeId);
    if (place === undefined || !canSeePlace(ctx, place)) continue;

    let kind: SeenAtKind;
    let friendName: string | null = null;
    if (sighting.kind === "menu") {
      kind = "MENU";
    } else {
      const visible = canSeeCheckInDetails(ctx, {
        userId: sighting.userId,
        viewerIsFriendOfCheckInUser:
          sighting.userId !== null &&
          isFriend(ctx, sighting.userId, facts.friendships),
        viewerIsCompanion: facts.viewerGroupIds.has(sighting.groupId),
      });
      if (!visible) continue;
      if (viewer !== null && sighting.userId === viewer) {
        kind = "OWN_LOG";
      } else {
        kind = "FRIEND_LOG";
        friendName =
          sighting.userId === null
            ? null
            : (facts.userNames.get(sighting.userId) ?? null);
      }
    }

    const row: SeenAtDto = {
      placeId: place.id,
      placeName: place.name,
      kind,
      at: sighting.at === null ? null : sighting.at.toISOString(),
      friendName,
      distanceMeters: place.distanceMeters,
    };
    const held = best.get(place.id);
    if (
      held === undefined ||
      rank(row.kind) < rank(held.kind) ||
      (row.kind === held.kind && time(row.at) > time(held.at))
    ) {
      best.set(place.id, row);
    }
  }

  const limit = Math.max(0, Math.min(Math.trunc(first), SEEN_AT_MAX));
  return [...best.values()]
    .sort((a, b) => {
      if (a.distanceMeters !== null && b.distanceMeters !== null) {
        if (a.distanceMeters !== b.distanceMeters) {
          return a.distanceMeters - b.distanceMeters;
        }
      } else if (a.distanceMeters !== null) {
        return -1;
      } else if (b.distanceMeters !== null) {
        return 1;
      }
      return time(b.at) - time(a.at) || a.placeId.localeCompare(b.placeId);
    })
    .slice(0, limit);
};

const validNear = (
  near: SeenAtInput["near"],
): { lat: number; lng: number } | null =>
  near != null &&
  Number.isFinite(near.lat) &&
  Number.isFinite(near.lng) &&
  Math.abs(near.lat) <= 90 &&
  Math.abs(near.lng) <= 180
    ? { lat: near.lat, lng: near.lng }
    : null;

/** Rows read per source; the answer is at most `SEEN_AT_MAX` places. */
const SIGHTINGS_READ = 500;

/**
 * The read. It narrows before policy does, for cost only: logs are read for
 * the viewer, their friends and the outings the viewer was on — the only
 * drinkers `canSeeCheckInDetails` could admit — and `selectSeenAt` still
 * decides every row.
 */
export const loadSeenAt = async (
  db: DbOrTx,
  ctx: Ctx,
  ref: ItemRef,
  input: SeenAtInput = {},
): Promise<SeenAtDto[]> => {
  const viewer = ctx.viewerId;
  if (viewer === null) return [];
  const friendships = await friendshipsOf(db, viewer);
  const friendIds = friendIdsOf(viewer, friendships);

  const viewerGroups = await db
    .selectDistinct({ groupId: checkIns.groupId })
    .from(checkIns)
    .where(and(eq(checkIns.userId, viewer), ARCS.checkIns.where(ref)));
  const viewerGroupIds = new Set(viewerGroups.map((row) => row.groupId));

  const logRows = await db
    .select({
      placeId: checkIns.placeId,
      userId: checkIns.userId,
      groupId: checkIns.groupId,
      at: checkIns.createdAt,
    })
    .from(checkIns)
    .where(
      and(
        ARCS.checkIns.where(ref),
        isNotNull(checkIns.placeId),
        or(
          inArray(checkIns.userId, [viewer, ...friendIds]),
          viewerGroupIds.size > 0
            ? inArray(checkIns.groupId, [...viewerGroupIds])
            : sql`false`,
        ),
      ),
    )
    .orderBy(sql`${checkIns.createdAt} desc`)
    .limit(SIGHTINGS_READ);

  const menuRows = await db
    .select({
      placeId: placeMenuItems.placeId,
      at: sql<Date | null>`coalesce(${menuScans.scannedAt}, ${placeMenuItems.createdAt})`.mapWith(
        (value: unknown) =>
          value === null || value === undefined
            ? null
            : new Date(String(value)),
      ),
    })
    .from(placeMenuItems)
    .leftJoin(menuScans, eq(menuScans.id, placeMenuItems.menuScanId))
    .where(ARCS.placeMenuItems.where(ref))
    .orderBy(sql`2 desc nulls last`)
    .limit(SIGHTINGS_READ);

  const sightings: SeenAtSighting[] = [
    ...menuRows.map(
      (row): SeenAtSighting => ({
        kind: "menu",
        placeId: row.placeId,
        at: row.at,
      }),
    ),
    ...logRows.flatMap((row): SeenAtSighting[] =>
      row.placeId === null
        ? []
        : [
            {
              kind: "log",
              placeId: row.placeId,
              userId: row.userId,
              groupId: row.groupId,
              at: row.at,
            },
          ],
    ),
  ];
  const placeIds = [...new Set(sightings.map((row) => row.placeId))];
  if (placeIds.length === 0) return [];

  const near = validNear(input.near);
  const distance =
    near === null
      ? sql<null>`null`
      : sql<number>`ST_Distance(${places.location}, ST_SetSRID(ST_MakePoint(${near.lng}::float8, ${near.lat}::float8), 4326)::geography)`;
  const placeRows = await db
    .select({
      id: places.id,
      name: places.name,
      displayName: places.displayName,
      createdById: places.createdBy,
      reviewStatus: places.reviewStatus,
      isActive: places.isActive,
      distanceMeters: distance,
    })
    .from(places)
    .where(inArray(places.id, placeIds));

  const placeFacts = new Map<string, SeenAtPlaceFacts>();
  for (const row of placeRows) {
    if (row.isActive === false) continue;
    placeFacts.set(row.id, {
      id: row.id,
      name: row.displayName ?? row.name,
      createdById: row.createdById,
      reviewStatus: row.reviewStatus as PlaceVisibility["reviewStatus"],
      distanceMeters:
        row.distanceMeters === null ? null : Number(row.distanceMeters),
    });
  }

  const friendLoggers = [
    ...new Set(
      logRows.flatMap((row) =>
        row.userId !== null && row.userId !== viewer ? [row.userId] : [],
      ),
    ),
  ];
  const names =
    friendLoggers.length === 0
      ? []
      : await db
          .select({ id: user.id, name: user.name })
          .from(user)
          .where(inArray(user.id, friendLoggers));

  return selectSeenAt(
    ctx,
    {
      sightings,
      places: placeFacts,
      friendships,
      viewerGroupIds,
      userNames: new Map(names.map((row) => [row.id, row.name])),
    },
    input.first ?? SEEN_AT_MAX,
  );
};
