/**
 * §1.6: "every method whose result depends on the viewer has three tests:
 * owner, friend, stranger." These are the three viewers, defined once, that
 * every B workstream's actor tests should reuse.
 */
import type { Ctx } from "@cellar-assistant/contracts/ctx";
import {
  adminCtx,
  anonymousCtx,
  systemCtx,
  userCtx,
} from "@cellar-assistant/contracts/ctx";
import { describe, expect, it } from "vitest";
import {
  bypassesPolicy,
  type CellarVisibility,
  canEditCheckIn,
  canRemoveCheckIn,
  canSee,
  canSeeCellar,
  canSeeCheckIn,
  canSeeCheckInDetails,
  canSeeItemImage,
  canSeePlace,
  canSeeTierList,
  checkInIsClaimed,
  type Friendship,
  isFriend,
  isOwner,
  isPlaceShared,
  PLACE_REVIEW_STATUSES,
  type PlaceReviewStatus,
  PRIVACY_VALUES,
  type Privacy,
} from "./index.ts";

const OWNER = "11111111-1111-1111-1111-111111111111";
const CO_OWNER = "22222222-2222-2222-2222-222222222222";
const FRIEND = "33333333-3333-3333-3333-333333333333";
const STRANGER = "44444444-4444-4444-4444-444444444444";

const owner = userCtx(OWNER, "req-owner");
const coOwner = userCtx(CO_OWNER, "req-co-owner");
const friend = userCtx(FRIEND, "req-friend");
const stranger = userCtx(STRANGER, "req-stranger");
const anonymous = anonymousCtx("req-anon");

/** Both directions, as §1.7's two-actor acceptance leaves them. */
const FRIENDSHIPS: Friendship[] = [
  { userId: OWNER, friendId: FRIEND },
  { userId: FRIEND, friendId: OWNER },
];

const cellar = (
  privacy: Privacy,
  overrides: Partial<CellarVisibility> = {},
): CellarVisibility => ({
  createdById: OWNER,
  privacy,
  coOwnerIds: [CO_OWNER],
  viewerIsFriendOfCreator: false,
  ...overrides,
});

/** What `CellarActor` actually does: derive the flag, then ask policy. */
const cellarFor = (ctx: Ctx, privacy: Privacy): CellarVisibility =>
  cellar(privacy, {
    viewerIsFriendOfCreator: isFriend(ctx, OWNER, FRIENDSHIPS),
  });

describe("isOwner", () => {
  it("allows the owner", () => {
    expect(isOwner(owner, OWNER)).toBe(true);
  });

  it("denies a friend", () => {
    expect(isOwner(friend, OWNER)).toBe(false);
  });

  it("denies a stranger", () => {
    expect(isOwner(stranger, OWNER)).toBe(false);
  });

  it("denies an anonymous viewer, and a row with no owner", () => {
    expect(isOwner(anonymous, OWNER)).toBe(false);
    expect(isOwner(owner, null)).toBe(false);
    expect(isOwner(owner, undefined)).toBe(false);
  });

  it("denies an anonymous viewer on an *unowned* row — both sides null", () => {
    // The case the two above straddle without covering: `viewerId` is null and
    // `ownerId` is null, so the bare `ownerId === ctx.viewerId` at the end is
    // `null === null`. Deleting `if (ctx.viewerId === null) return false;`
    // leaves all 31 assertions in this file green and makes every signed-out
    // caller the owner of every row whose owner column is null.
    //
    // No table reaches that state today — `check_ins.user_id` and
    // `item_image.user_id` are both NOT NULL — but the parameter's type says
    // `string | null | undefined`, every caller is free to pass one, and this
    // helper is the single gate four owner-only tables share.
    expect(isOwner(anonymous, null)).toBe(false);
    expect(isOwner(anonymous, undefined)).toBe(false);
  });

  it("lets system and admin through", () => {
    expect(isOwner(systemCtx("r"), OWNER)).toBe(true);
    expect(isOwner(adminCtx("someone", "r"), OWNER)).toBe(true);
    expect(bypassesPolicy(userCtx(OWNER, "r"))).toBe(false);
  });
});

describe("isFriend", () => {
  it("matches a friendship stored in either direction", () => {
    expect(isFriend(friend, OWNER, FRIENDSHIPS)).toBe(true);
    expect(isFriend(owner, FRIEND, FRIENDSHIPS)).toBe(true);
    // Half-delivered acceptance (§1.7): only the recipient's row exists yet.
    expect(isFriend(friend, OWNER, [{ userId: OWNER, friendId: FRIEND }])).toBe(
      true,
    );
  });

  it("denies a stranger and an anonymous viewer", () => {
    expect(isFriend(stranger, OWNER, FRIENDSHIPS)).toBe(false);
    expect(isFriend(anonymous, OWNER, FRIENDSHIPS)).toBe(false);
  });

  it("is not a permission check: system does not fabricate a friendship", () => {
    expect(isFriend(systemCtx("r"), OWNER, FRIENDSHIPS)).toBe(false);
  });

  it("is never true of a user and themselves", () => {
    expect(isFriend(owner, OWNER, [{ userId: OWNER, friendId: OWNER }])).toBe(
      false,
    );
  });
});

describe("canSee — the four branches (§1.6)", () => {
  it("covers every privacy value the column can hold", () => {
    expect([...PRIVACY_VALUES]).toEqual(["PUBLIC", "FRIENDS", "PRIVATE"]);
  });

  it("1. an owner sees it at any privacy", () => {
    for (const privacy of PRIVACY_VALUES) {
      expect(
        canSee(owner, {
          privacy,
          ownerIds: [OWNER],
          viewerIsFriendOfCreator: false,
        }),
      ).toBe(true);
    }
  });

  it("2. PUBLIC is visible to a stranger and to anonymous", () => {
    const subject = {
      privacy: "PUBLIC",
      ownerIds: [OWNER],
      viewerIsFriendOfCreator: false,
    } as const;
    expect(canSee(stranger, subject)).toBe(true);
    expect(canSee(anonymous, subject)).toBe(true);
  });

  it("3. FRIENDS needs the friendship, not merely a signed-in viewer", () => {
    expect(
      canSee(friend, {
        privacy: "FRIENDS",
        ownerIds: [OWNER],
        viewerIsFriendOfCreator: true,
      }),
    ).toBe(true);
    expect(
      canSee(stranger, {
        privacy: "FRIENDS",
        ownerIds: [OWNER],
        viewerIsFriendOfCreator: false,
      }),
    ).toBe(false);
    // An anonymous viewer can never be a friend, whatever the flag says.
    expect(
      canSee(anonymous, {
        privacy: "FRIENDS",
        ownerIds: [OWNER],
        viewerIsFriendOfCreator: true,
      }),
    ).toBe(false);
  });

  it("4. PRIVATE is hidden from a friend and a stranger alike", () => {
    expect(
      canSee(friend, {
        privacy: "PRIVATE",
        ownerIds: [OWNER],
        viewerIsFriendOfCreator: true,
      }),
    ).toBe(false);
    expect(
      canSee(stranger, {
        privacy: "PRIVATE",
        ownerIds: [OWNER],
        viewerIsFriendOfCreator: false,
      }),
    ).toBe(false);
  });

  it("a null ownerId never matches a null viewerId", () => {
    expect(
      canSee(anonymous, {
        privacy: "PRIVATE",
        ownerIds: [null],
        viewerIsFriendOfCreator: false,
      }),
    ).toBe(false);
  });
});

describe("canSeeCellar", () => {
  it("owner: sees PUBLIC, FRIENDS and PRIVATE", () => {
    for (const privacy of PRIVACY_VALUES) {
      expect(canSeeCellar(owner, cellarFor(owner, privacy))).toBe(true);
    }
  });

  it("co-owner: sees a PRIVATE cellar (cellar_owners counts as owner)", () => {
    expect(canSeeCellar(coOwner, cellarFor(coOwner, "PRIVATE"))).toBe(true);
  });

  it("friend: sees PUBLIC and FRIENDS, not PRIVATE", () => {
    expect(canSeeCellar(friend, cellarFor(friend, "PUBLIC"))).toBe(true);
    expect(canSeeCellar(friend, cellarFor(friend, "FRIENDS"))).toBe(true);
    expect(canSeeCellar(friend, cellarFor(friend, "PRIVATE"))).toBe(false);
  });

  it("stranger: sees PUBLIC only — FRIENDS and PRIVATE are denied", () => {
    expect(canSeeCellar(stranger, cellarFor(stranger, "PUBLIC"))).toBe(true);
    expect(canSeeCellar(stranger, cellarFor(stranger, "FRIENDS"))).toBe(false);
    expect(canSeeCellar(stranger, cellarFor(stranger, "PRIVATE"))).toBe(false);
  });

  it("system sees everything; that ctx is not derivable from a request", () => {
    expect(canSeeCellar(systemCtx("r"), cellar("PRIVATE"))).toBe(true);
  });
});

describe("canSeeTierList", () => {
  const list = (privacy: Privacy, viewerIsFriendOfCreator: boolean) => ({
    createdById: OWNER,
    privacy,
    viewerIsFriendOfCreator,
  });

  it("owner: sees a PRIVATE list", () => {
    expect(canSeeTierList(owner, list("PRIVATE", false))).toBe(true);
  });

  it("friend: sees FRIENDS, not PRIVATE", () => {
    expect(canSeeTierList(friend, list("FRIENDS", true))).toBe(true);
    expect(canSeeTierList(friend, list("PRIVATE", true))).toBe(false);
  });

  it("stranger: denied on FRIENDS and PRIVATE", () => {
    expect(canSeeTierList(stranger, list("FRIENDS", false))).toBe(false);
    expect(canSeeTierList(stranger, list("PRIVATE", false))).toBe(false);
    expect(canSeeTierList(stranger, list("PUBLIC", false))).toBe(true);
  });
});

describe("canSeeCheckIn", () => {
  const checkIn = (
    viewerIsFriendOfCheckInUser: boolean,
    cellarPrivacy: Privacy,
  ) => ({
    userId: OWNER,
    cellar: cellar(cellarPrivacy, { viewerIsFriendOfCreator: false }),
    viewerIsFriendOfCheckInUser,
  });

  it("owner: sees their own check-in in their PRIVATE cellar", () => {
    expect(canSeeCheckIn(owner, checkIn(false, "PRIVATE"))).toBe(true);
  });

  it("friend: sees a friend's check-in even from a PRIVATE cellar", () => {
    expect(canSeeCheckIn(friend, checkIn(true, "PRIVATE"))).toBe(true);
  });

  it("stranger: denied unless the cellar itself is public", () => {
    expect(canSeeCheckIn(stranger, checkIn(false, "PRIVATE"))).toBe(false);
    expect(canSeeCheckIn(stranger, checkIn(false, "FRIENDS"))).toBe(false);
    expect(canSeeCheckIn(stranger, checkIn(false, "PUBLIC"))).toBe(true);
  });

  it("anonymous: denied on a private cellar", () => {
    expect(canSeeCheckIn(anonymous, checkIn(false, "PRIVATE"))).toBe(false);
  });

  it("anonymous: denied even if the friend flag arrives set", () => {
    // `viewerIsFriendOfCheckInUser` is computed by the caller, and `isFriend`
    // can never return true for a null viewer — so this asserts the guard that
    // makes that a property of this function rather than of every call site.
    // Dropping `ctx.viewerId !== null &&` from the friend branch leaves the
    // whole file green, and hands a signed-out caller any check-in whose
    // caller-supplied flag is wrong.
    expect(canSeeCheckIn(anonymous, checkIn(true, "PRIVATE"))).toBe(false);
  });
});

describe("canSeeCheckIn — a bottle-less log (X02)", () => {
  const log = (flags: { friend?: boolean; companion?: boolean }) => ({
    userId: OWNER,
    cellar: null,
    viewerIsFriendOfCheckInUser: flags.friend ?? false,
    viewerIsCompanion: flags.companion ?? false,
  });

  it("owner sees their own bottle-less entry", () => {
    expect(canSeeCheckIn(owner, log({}))).toBe(true);
  });

  it("a friend of the drinker sees it", () => {
    expect(canSeeCheckIn(friend, log({ friend: true }))).toBe(true);
  });

  it("a companion sees the entry that names them, friend or not", () => {
    expect(canSeeCheckIn(stranger, log({ companion: true }))).toBe(true);
  });

  it("a stranger is denied: no cellar means no public way in", () => {
    expect(canSeeCheckIn(stranger, log({}))).toBe(false);
  });

  it("an absent companion flag is never permission", () => {
    expect(
      canSeeCheckIn(stranger, {
        userId: OWNER,
        cellar: null,
        viewerIsFriendOfCheckInUser: false,
      }),
    ).toBe(false);
  });

  it("anonymous is denied even if both flags arrive set", () => {
    expect(
      canSeeCheckIn(anonymous, log({ friend: true, companion: true })),
    ).toBe(false);
  });

  it("a removed bottle keeps the drinker's and friends' access, drops the cellar's", () => {
    // Same row before and after `CellarActor.removeItem`: the FK nulls
    // `cellar_item_id`, so the public cellar branch is gone.
    const before = {
      userId: OWNER,
      cellar: cellar("PUBLIC", { viewerIsFriendOfCreator: false }),
      viewerIsFriendOfCheckInUser: false,
    };
    expect(canSeeCheckIn(stranger, before)).toBe(true);
    expect(canSeeCheckIn(stranger, { ...before, cellar: null })).toBe(false);
    expect(canSeeCheckIn(owner, { ...before, cellar: null })).toBe(true);
  });
});

describe("canSeeCheckInDetails — what the drinker said (X02)", () => {
  const entry = (flags: { friend?: boolean; companion?: boolean }) => ({
    userId: OWNER,
    viewerIsFriendOfCheckInUser: flags.friend ?? false,
    viewerIsCompanion: flags.companion ?? false,
  });

  it("the drinker, a companion and a friend of the drinker see the details", () => {
    expect(canSeeCheckInDetails(owner, entry({}))).toBe(true);
    expect(canSeeCheckInDetails(friend, entry({ friend: true }))).toBe(true);
    expect(canSeeCheckInDetails(stranger, entry({ companion: true }))).toBe(
      true,
    );
  });

  it("a viewer admitted only by a PUBLIC cellar sees the entry but not the details", () => {
    const viaCellar = {
      ...entry({}),
      cellar: cellar("PUBLIC", { viewerIsFriendOfCreator: false }),
    };
    expect(canSeeCheckIn(stranger, viaCellar)).toBe(true);
    expect(canSeeCheckInDetails(stranger, viaCellar)).toBe(false);
  });

  it("anonymous never sees details, whatever flags arrive", () => {
    expect(
      canSeeCheckInDetails(anonymous, entry({ friend: true, companion: true })),
    ).toBe(false);
  });
});

describe("canEditCheckIn / canRemoveCheckIn", () => {
  const written = { userId: FRIEND, createdById: OWNER };
  const unclaimed = { ...written, claimedByDrinker: false };
  const claimed = { ...written, claimedByDrinker: true };

  it("only the drinker edits — not whoever wrote the row for them", () => {
    expect(canEditCheckIn(friend, written)).toBe(true);
    expect(canEditCheckIn(owner, written)).toBe(false);
    expect(canEditCheckIn(stranger, written)).toBe(false);
  });

  it("the drinker and the writer may both remove an unclaimed row; nobody else", () => {
    expect(canRemoveCheckIn(friend, unclaimed)).toBe(true);
    expect(canRemoveCheckIn(owner, unclaimed)).toBe(true);
    expect(canRemoveCheckIn(stranger, unclaimed)).toBe(false);
    expect(canRemoveCheckIn(anonymous, unclaimed)).toBe(false);
  });

  it("once the drinker has added their own words, only they remove it", () => {
    expect(canRemoveCheckIn(friend, claimed)).toBe(true);
    expect(canRemoveCheckIn(owner, claimed)).toBe(false);
  });

  it("a row is claimed by a score, a note, a tag or a photo — not by a place", () => {
    const bare = { score: null, note: null, tags: [], photoFileId: null };
    expect(checkInIsClaimed(bare)).toBe(false);
    expect(checkInIsClaimed({ ...bare, score: 3 })).toBe(true);
    expect(checkInIsClaimed({ ...bare, note: "plum" })).toBe(true);
    expect(checkInIsClaimed({ ...bare, tags: ["plum"] })).toBe(true);
    expect(checkInIsClaimed({ ...bare, photoFileId: "f" })).toBe(true);
  });
});

describe("canSeeItemImage", () => {
  const image = (isPublic: boolean) => ({ userId: OWNER, isPublic });

  it("owner: sees their own private image", () => {
    expect(canSeeItemImage(owner, image(false))).toBe(true);
  });

  it("friend: a private image is not shared by friendship", () => {
    expect(canSeeItemImage(friend, image(false))).toBe(false);
  });

  it("stranger: sees a public image, never a private one", () => {
    expect(canSeeItemImage(stranger, image(true))).toBe(true);
    expect(canSeeItemImage(stranger, image(false))).toBe(false);
  });

  it("anonymous: sees a public image", () => {
    expect(canSeeItemImage(anonymous, image(true))).toBe(true);
    expect(canSeeItemImage(anonymous, image(false))).toBe(false);
  });
});

describe("canSeePlace (X27 / D28)", () => {
  const place = (
    reviewStatus: PlaceReviewStatus,
    createdById: string | null = OWNER,
  ) => ({ createdById, reviewStatus });

  it("an approved place is shared: owner, friend, stranger and anonymous", () => {
    for (const ctx of [owner, friend, stranger, anonymous]) {
      expect(canSeePlace(ctx, place("approved"))).toBe(true);
    }
    // An Overture row has no creator at all.
    expect(canSeePlace(stranger, place("approved", null))).toBe(true);
  });

  it.each(["pending", "rejected"] as const)(
    "a %s place is its creator's alone",
    (status) => {
      expect(canSeePlace(owner, place(status))).toBe(true);
      expect(canSeePlace(friend, place(status))).toBe(false);
      expect(canSeePlace(stranger, place(status))).toBe(false);
      expect(canSeePlace(anonymous, place(status))).toBe(false);
    },
  );

  it("an unshared row with no creator is nobody's (not even an anonymous null match)", () => {
    expect(canSeePlace(anonymous, place("pending", null))).toBe(false);
  });

  it("system and admin bypass, as everywhere (the outbox delivers the review)", () => {
    expect(canSeePlace(systemCtx("test"), place("pending"))).toBe(true);
    expect(canSeePlace(adminCtx(STRANGER, "r"), place("rejected"))).toBe(true);
  });

  it("isPlaceShared is the approved status and nothing else", () => {
    expect(
      PLACE_REVIEW_STATUSES.filter((s) => isPlaceShared(place(s))),
    ).toEqual(["approved"]);
  });
});
