/**
 * Public share pages and friend invites (roadmap X17).
 *
 * ## The anonymous read surface is its own, narrow shape
 *
 * A share page is read by a viewer with no session — a friend tapping a link
 * in a group chat, or a link-preview crawler fetching the page's card. Rather
 * than open the signed-in read paths (`TierListActor.get`, `ItemActor.get`,
 * `RecipeActor.get`, and every field resolver hanging off them) to anonymous
 * callers, each shareable aggregate grows one `getShared` method returning one
 * of the DTOs below. They are **closed whitelists**: a field is on a shared
 * DTO because a share page renders it, and nothing else crosses — no
 * `createdById`, no barcode, no reviews, no AI output, no viewer-relative
 * state.
 *
 * The rules, decided in `packages/policy` (`canShareAnonymously`) and applied
 * by each actor:
 *
 *   1. **Only PUBLIC things.** A tier list is shared when its `privacy` is
 *      `PUBLIC`; FRIENDS and PRIVATE are not, whoever asks.
 *   2. **Viewer-independent.** `getShared` answers the same for every caller,
 *      signed in or not — so a signed-in owner cannot see their own private
 *      list through it, an image is included only when it is public, and a
 *      cached card can never carry one viewer's view to another.
 *   3. **No existence oracle.** A private aggregate and a missing one both
 *      throw `NotFoundError`, with the same message shape, and the client
 *      renders one copy for both (decision D24).
 *   4. **No wider than a signed-in stranger.** Every field here is one a
 *      signed-in stranger can already read through the normal API.
 *
 * ## Friend invites
 *
 * A user has at most one live invite secret (`friend_invites`, written only by
 * that user's `UserActor`). The link carries an **invite token**: the
 * inviter's id and the secret, packed into one URL-safe string so the link is
 * a single opaque segment (`/invite/<token>`). The token says *whose* invite
 * it is, so the inviter's actor can be addressed directly; the secret is what
 * makes it an invite rather than a user id. Resetting the link rotates the
 * secret, and every earlier link stops working.
 */
import type { PermissionType } from "./enums.ts";
import type { ItemType } from "./items.ts";
import type { RecipeType } from "./recipes.ts";
import type { TierListEntryType } from "./tier-lists.ts";

/* -------------------------------------------------------------------------- */
/* Shared tier lists                                                           */
/* -------------------------------------------------------------------------- */

export type SharedTierListEntryDto = {
  readonly id: string;
  readonly band: number;
  readonly position: number;
  /** What the list's author wrote about this entry — part of the public list. */
  readonly notes: string | null;
  readonly entryType: TierListEntryType;
  /** The ranked item's or place's own id. */
  readonly entryId: string;
  /** `null` only when the referenced row could not be read (a torn read). */
  readonly name: string | null;
  /** `locality, region, country` for a place; `region, country` for an item. */
  readonly location: string | null;
  /** A **public** `item_image` of the ranked item; `null` for places. */
  readonly imageFileId: string | null;
};

export type SharedTierListDto = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly listType: string;
  /** Always `PUBLIC` — anything else is `NotFoundError`. Carried for the page. */
  readonly privacy: PermissionType;
  /** The author's display name, which every signed-in user already sees. */
  readonly ownerDisplayName: string | null;
  readonly entries: readonly SharedTierListEntryDto[];
  readonly updatedAt: string | null;
};

/* -------------------------------------------------------------------------- */
/* Shared items                                                                */
/* -------------------------------------------------------------------------- */

/** One attribute value as the wire carries it — the item's own columns. */
export type SharedAttributeValue = string | number | boolean | null;

export type SharedItemDto = {
  readonly id: string;
  readonly type: ItemType;
  readonly name: string;
  readonly description: string | null;
  readonly country: string | null;
  /**
   * The type's attributes, keyed exactly as `ITEM_TYPE_SPECS[type].attributes`
   * names them (`vintage`, `style`, …). Only spec attributes cross: the shared
   * columns that are not catalog facts (`createdById`, `barcodeCode`) never do.
   */
  readonly attributes: Readonly<Record<string, SharedAttributeValue>>;
  /** The newest **public** image's file. Never a private upload. */
  readonly imageFileId: string | null;
  readonly imagePlaceholder: string | null;
  /** Everyone's average and count — a number names nobody. */
  readonly scoreAverage: number | null;
  readonly scoreCount: number;
};

/* -------------------------------------------------------------------------- */
/* Shared recipes                                                              */
/* -------------------------------------------------------------------------- */

export type SharedRecipeIngredientDto = {
  /** The ingredient's own name (an item's or a generic ingredient's). */
  readonly name: string | null;
  readonly quantity: number | null;
  readonly unit: string | null;
  readonly isOptional: boolean;
};

export type SharedRecipeInstructionDto = {
  readonly stepNumber: number;
  readonly text: string;
};

export type SharedRecipeDto = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly type: RecipeType;
  readonly difficultyLevel: number | null;
  readonly prepTimeMinutes: number | null;
  readonly servingSize: number | null;
  readonly imageUrl: string | null;
  readonly ingredients: readonly SharedRecipeIngredientDto[];
  readonly instructions: readonly SharedRecipeInstructionDto[];
};

/* -------------------------------------------------------------------------- */
/* Friend invites                                                              */
/* -------------------------------------------------------------------------- */

/** The viewer's own invite link, as its token. */
export type FriendInviteDto = {
  readonly token: string;
  /** ISO-8601: when this secret was minted (a reset re-mints it). */
  readonly createdAt: string;
};

/**
 * Where the viewer stands with an invite's author, decided by the inviter's
 * actor. `SIGNED_OUT` is the share-page case: the page offers sign-up and
 * comes back here afterwards.
 */
export const FRIEND_INVITE_STATUSES = [
  "SIGNED_OUT",
  "OWN_INVITE",
  "ALREADY_FRIENDS",
  "CAN_ACCEPT",
] as const;
export type FriendInviteStatus = (typeof FRIEND_INVITE_STATUSES)[number];

export type FriendInvitePreviewDto = {
  readonly inviterId: string;
  readonly inviterDisplayName: string;
  readonly inviterAvatarUrl: string | null;
  readonly status: FriendInviteStatus;
};

export type AcceptFriendInviteInput = {
  readonly inviterId: string;
  readonly secret: string;
};

export type AcceptFriendInviteResult = {
  readonly friendId: string;
  /** `false` when the two were already friends and nothing was written. */
  readonly becameFriends: boolean;
};

/* -------------------------------------------------------------------------- */
/* The token                                                                   */
/* -------------------------------------------------------------------------- */

/** 16 random bytes, base64url without padding: always 22 characters. */
export const INVITE_SECRET_LENGTH = 22;
/** A uuid's 16 bytes in base64url (22) plus the secret (22). */
export const INVITE_TOKEN_LENGTH = 44;

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const base64UrlToBytes = (value: string): Uint8Array | null => {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
};

const uuidToBytes = (uuid: string): Uint8Array => {
  const hex = uuid.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let index = 0; index < 16; index++) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
};

const bytesToUuid = (bytes: Uint8Array): string => {
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
};

export const isInviteSecret = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length === INVITE_SECRET_LENGTH &&
  BASE64URL.test(value);

/** Pack an inviter id and their secret into the one segment a link carries. */
export const formatInviteToken = (
  inviterId: string,
  secret: string,
): string => {
  if (!UUID.test(inviterId)) throw new Error("inviterId must be a uuid");
  if (!isInviteSecret(secret)) throw new Error("not an invite secret");
  return `${bytesToBase64Url(uuidToBytes(inviterId))}${secret}`;
};

/**
 * The inverse of {@link formatInviteToken}, or `null` for anything that is not
 * a well-formed token. The id comes back lowercase — Postgres's spelling, and
 * the one actor ids are keyed by.
 */
export const parseInviteToken = (
  token: unknown,
): AcceptFriendInviteInput | null => {
  if (
    typeof token !== "string" ||
    token.length !== INVITE_TOKEN_LENGTH ||
    !BASE64URL.test(token)
  ) {
    return null;
  }
  const idPart = token.slice(0, 22);
  const idBytes = base64UrlToBytes(idPart);
  if (idBytes === null || idBytes.length !== 16) return null;
  // The last character of 16 bytes in base64url carries 2 spare bits; only
  // the canonical spelling is a token, so one invite has exactly one link.
  if (bytesToBase64Url(idBytes) !== idPart) return null;
  const secret = token.slice(22);
  if (!isInviteSecret(secret)) return null;
  return { inviterId: bytesToUuid(idBytes), secret };
};
