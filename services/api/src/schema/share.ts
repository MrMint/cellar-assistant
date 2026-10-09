/**
 * X17 — public share pages and friend invites.
 *
 * ## The only fields an anonymous request is meant to use
 *
 * Every other read in this schema reaches an actor method that refuses a
 * request with no viewer (`requireSignedIn`, the catalog rule) or answers it
 * under the four-branch rule. The share pages need a few things to work with
 * **no** viewer, so they get their own narrow surface rather than a widened
 * one: `sharedTierList`, `sharedItem` and `sharedRecipe` each resolve through
 * one actor method (`getShared`) whose DTO is a closed whitelist, and whose
 * answer is the same for every caller (`packages/contracts/src/share.ts`,
 * `canShareAnonymously` in `packages/policy`). Nothing here decides
 * visibility; the actors do.
 *
 * `NotFoundError` covers "missing" and "not public" alike, worded identically
 * by the actor, so the client shows one message for both (decision D24).
 *
 * ## Images
 *
 * A shared DTO carries a file id; `imageUrl` presigns it through `FileActor`
 * with the request's own ctx, which for an anonymous request succeeds only
 * when something public references the file. A file that cannot be signed
 * (unverified, or gone) is `null`, not an error: a missing photo should cost
 * the page a placeholder, not the page.
 *
 * ## Friend invites
 *
 * The token in an invite link (`/invite/<token>`) names its inviter, so
 * `friendInvitePreview` addresses `UserActor(inviter)` directly — anonymous
 * allowed — and `acceptFriendInvite` addresses the viewer's own actor.
 */
import type {
  AcceptFriendInviteResult,
  FriendInviteDto,
  FriendInvitePreviewDto,
  SharedItemDto,
  SharedRecipeDto,
  SharedRecipeIngredientDto,
  SharedRecipeInstructionDto,
  SharedTierListDto,
  SharedTierListEntryDto,
} from "@cellar-assistant/contracts";
import {
  FileActorDescriptor,
  ForbiddenError,
  FRIEND_INVITE_STATUSES,
  ItemActorDescriptor,
  itemActorId,
  NotFoundError,
  offsetPage,
  parseInviteToken,
  RecipeActorDescriptor,
  TierListActorDescriptor,
  UserActorDescriptor,
} from "@cellar-assistant/contracts";
import type { ApiContext } from "../context.ts";
import { builder } from "./builder.ts";
import { PermissionTypeEnum } from "./enums.ts";
import { ItemTypeEnum } from "./item.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";
import { RecipeTypeEnum } from "./recipe.ts";
import { TierListEntryTypeEnum } from "./tier-list.ts";
import { Viewer } from "./viewer.ts";

/** A presigned URL for a file something public points at, or `null`. */
const presignOrNull = async (
  context: ApiContext,
  fileId: string | null,
): Promise<string | null> => {
  if (fileId === null) return null;
  try {
    return (await context.actor(FileActorDescriptor, fileId).presignRead()).url;
  } catch {
    return null;
  }
};

/* -------------------------------------------------------------------------- */
/* Shared tier lists                                                           */
/* -------------------------------------------------------------------------- */

const SharedTierListEntryType = builder
  .objectRef<SharedTierListEntryDto>("SharedTierListEntry")
  .implement({
    description:
      "One ranked entry on a public tier list, described for a viewer who " +
      "may not be signed in.",
    fields: (t) => ({
      id: t.exposeID("id"),
      band: t.exposeInt("band"),
      position: t.exposeInt("position"),
      notes: t.exposeString("notes", { nullable: true }),
      entryType: t.field({
        type: TierListEntryTypeEnum,
        resolve: (entry) => entry.entryType,
      }),
      entryId: t.exposeID("entryId"),
      name: t.exposeString("name", {
        nullable: true,
        description: "Null only when the ranked row could not be read.",
      }),
      location: t.exposeString("location", { nullable: true }),
      imageUrl: t.field({
        type: "String",
        nullable: true,
        description:
          "The ranked item's newest public photo, presigned. Null for a " +
          "place, and for an item with no public photo.",
        resolve: (entry, _args, context) =>
          presignOrNull(context, entry.imageFileId),
      }),
    }),
  });

const SharedTierListEntryConnection = builder.connectionObject(
  { type: SharedTierListEntryType, name: "SharedTierListEntryConnection" },
  { name: "SharedTierListEntryEdge" },
);

const SharedTierListType = builder
  .objectRef<SharedTierListDto>("SharedTierList")
  .implement({
    description:
      "A PUBLIC tier list as its share page shows it — readable with no " +
      "session. Not the `TierList` type: no creator id, no insights, no " +
      "viewer-relative state.",
    fields: (t) => ({
      id: t.exposeID("id"),
      name: t.exposeString("name"),
      description: t.exposeString("description", { nullable: true }),
      listType: t.exposeString("listType"),
      privacy: t.field({
        type: PermissionTypeEnum,
        resolve: (tierList) => tierList.privacy,
      }),
      ownerDisplayName: t.exposeString("ownerDisplayName", {
        nullable: true,
        description:
          "The author's display name, as signed-in viewers see it beside the " +
          "list. Null for a deleted author, or a name shaped like an email.",
      }),
      updatedAt: t.expose("updatedAt", { type: "DateTime", nullable: true }),
      entries: t.field({
        type: SharedTierListEntryConnection,
        description:
          "Every entry, `band desc, position asc`, paged like every list " +
          "(§1.5). Each entry's `imageUrl` is one presign, so the page bounds " +
          "that too.",
        args: t.arg.connectionArgs(),
        resolve: (tierList, args) =>
          connectionFromPage(offsetPage(tierList.entries, toPageArgs(args))),
      }),
    }),
  });

/* -------------------------------------------------------------------------- */
/* Shared items                                                                */
/* -------------------------------------------------------------------------- */

const SharedItemType = builder
  .objectRef<SharedItemDto>("SharedItem")
  .implement({
    description:
      "An item as its share page shows it — readable with no session. Catalog " +
      "facts, the newest public photo and everyone's score; nothing else.",
    fields: (t) => ({
      id: t.exposeID("id"),
      type: t.field({ type: ItemTypeEnum, resolve: (item) => item.type }),
      name: t.exposeString("name"),
      description: t.exposeString("description", { nullable: true }),
      country: t.exposeString("country", { nullable: true }),
      attributes: t.field({
        type: "JSON",
        description:
          "The type's attributes, keyed as the type's own fields are named " +
          "(`vintage`, `style`, `variety`, …). Scalars only.",
        resolve: (item) => item.attributes,
      }),
      imageUrl: t.field({
        type: "String",
        nullable: true,
        resolve: (item, _args, context) =>
          presignOrNull(context, item.imageFileId),
      }),
      imagePlaceholder: t.exposeString("imagePlaceholder", { nullable: true }),
      scoreAverage: t.exposeFloat("scoreAverage", { nullable: true }),
      scoreCount: t.exposeInt("scoreCount"),
    }),
  });

/* -------------------------------------------------------------------------- */
/* Shared recipes                                                              */
/* -------------------------------------------------------------------------- */

const SharedRecipeIngredientType = builder
  .objectRef<SharedRecipeIngredientDto>("SharedRecipeIngredient")
  .implement({
    fields: (t) => ({
      name: t.exposeString("name", { nullable: true }),
      quantity: t.exposeFloat("quantity", { nullable: true }),
      unit: t.exposeString("unit", { nullable: true }),
      isOptional: t.exposeBoolean("isOptional"),
    }),
  });

const SharedRecipeInstructionType = builder
  .objectRef<SharedRecipeInstructionDto>("SharedRecipeInstruction")
  .implement({
    fields: (t) => ({
      stepNumber: t.exposeInt("stepNumber"),
      text: t.exposeString("text"),
    }),
  });

const SharedRecipeIngredientConnection = builder.connectionObject(
  {
    type: SharedRecipeIngredientType,
    name: "SharedRecipeIngredientConnection",
  },
  { name: "SharedRecipeIngredientEdge" },
);

const SharedRecipeInstructionConnection = builder.connectionObject(
  {
    type: SharedRecipeInstructionType,
    name: "SharedRecipeInstructionConnection",
  },
  { name: "SharedRecipeInstructionEdge" },
);

const SharedRecipeType = builder
  .objectRef<SharedRecipeDto>("SharedRecipe")
  .implement({
    description:
      "A recipe as its share page shows it — readable with no session. No " +
      "author, votes or reviews; ingredients by name.",
    fields: (t) => ({
      id: t.exposeID("id"),
      name: t.exposeString("name"),
      description: t.exposeString("description", { nullable: true }),
      type: t.field({ type: RecipeTypeEnum, resolve: (recipe) => recipe.type }),
      difficultyLevel: t.exposeInt("difficultyLevel", { nullable: true }),
      prepTimeMinutes: t.exposeInt("prepTimeMinutes", { nullable: true }),
      servingSize: t.exposeInt("servingSize", { nullable: true }),
      imageUrl: t.exposeString("imageUrl", { nullable: true }),
      ingredients: t.field({
        type: SharedRecipeIngredientConnection,
        description:
          "Required first, then by name — `Recipe.ingredients`' order.",
        args: t.arg.connectionArgs(),
        resolve: (recipe, args) =>
          connectionFromPage(offsetPage(recipe.ingredients, toPageArgs(args))),
      }),
      instructions: t.field({
        type: SharedRecipeInstructionConnection,
        description: "In step order.",
        args: t.arg.connectionArgs(),
        resolve: (recipe, args) =>
          connectionFromPage(offsetPage(recipe.instructions, toPageArgs(args))),
      }),
    }),
  });

/* -------------------------------------------------------------------------- */
/* Root fields: the share reads                                                */
/* -------------------------------------------------------------------------- */

builder.queryField("sharedTierList", (t) =>
  t.field({
    type: SharedTierListType,
    description:
      "A PUBLIC tier list for its share page. Works with no session. " +
      "`NotFoundError` for a list that is missing or not PUBLIC alike — " +
      "including your own private one: read `tierList` for that.",
    errors: {},
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context.actor(TierListActorDescriptor, String(args.id)).getShared(),
  }),
);

builder.queryField("sharedItem", (t) =>
  t.field({
    type: SharedItemType,
    description: "An item for its share page. Works with no session.",
    errors: {},
    args: {
      id: t.arg.id({ required: true }),
      type: t.arg({ type: ItemTypeEnum, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(
          ItemActorDescriptor,
          itemActorId({ type: args.type, id: String(args.id) }),
        )
        .getShared(),
  }),
);

builder.queryField("sharedRecipe", (t) =>
  t.field({
    type: SharedRecipeType,
    description: "A recipe for its share page. Works with no session.",
    errors: {},
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context.actor(RecipeActorDescriptor, String(args.id)).getShared(),
  }),
);

/* -------------------------------------------------------------------------- */
/* Friend invites                                                              */
/* -------------------------------------------------------------------------- */

const FriendInviteType = builder
  .objectRef<FriendInviteDto>("FriendInvite")
  .implement({
    description:
      "The viewer's own invite link, as its token: the link is " +
      "`/invite/<token>`. Anyone who opens it can become your friend.",
    fields: (t) => ({
      token: t.exposeString("token"),
      createdAt: t.expose("createdAt", { type: "DateTime" }),
    }),
  });

const FriendInviteStatusEnum = builder.enumType("FriendInviteStatus", {
  description:
    "Where the viewer stands with an invite's author. SIGNED_OUT: no " +
    "session — offer sign-up and come back. OWN_INVITE: the viewer sent it. " +
    "ALREADY_FRIENDS: nothing to do. CAN_ACCEPT: `acceptFriendInvite` will " +
    "make you friends.",
  values: FRIEND_INVITE_STATUSES,
});

const FriendInvitePreviewType = builder
  .objectRef<FriendInvitePreviewDto>("FriendInvitePreview")
  .implement({
    fields: (t) => ({
      inviterId: t.exposeID("inviterId"),
      inviterDisplayName: t.exposeString("inviterDisplayName"),
      inviterAvatarUrl: t.exposeString("inviterAvatarUrl", { nullable: true }),
      status: t.field({
        type: FriendInviteStatusEnum,
        resolve: (preview) => preview.status,
      }),
    }),
  });

const AcceptFriendInvitePayloadType = builder
  .objectRef<AcceptFriendInviteResult>("AcceptFriendInvitePayload")
  .implement({
    fields: (t) => ({
      friendId: t.exposeID("friendId"),
      becameFriends: t.exposeBoolean("becameFriends", {
        description:
          "False when you were already friends and nothing was written. The " +
          "inviter's side of a new friendship follows through the outbox.",
      }),
    }),
  });

/** A token that is not one names no invite — the same answer as a stale one. */
const requireToken = (token: string) => {
  const parsed = parseInviteToken(token);
  if (parsed === null) throw new NotFoundError("no such invite");
  return parsed;
};

const myUserActor = (context: ApiContext, what: string) => {
  const viewerId = context.ctx.viewerId;
  if (viewerId === null) throw new ForbiddenError(`sign in to ${what}`);
  return context.actor(UserActorDescriptor, viewerId);
};

builder.queryField("friendInvitePreview", (t) =>
  t.field({
    type: FriendInvitePreviewType,
    description:
      "Who sent an invite link, and where the viewer stands with them. " +
      "Works with no session. `NotFoundError` for a link that was reset or " +
      "never existed.",
    errors: {},
    args: { token: t.arg.string({ required: true }) },
    resolve: (_root, args, context) => {
      const { inviterId, secret } = requireToken(args.token);
      return context
        .actor(UserActorDescriptor, inviterId)
        .previewFriendInvite(secret);
    },
  }),
);

builder.objectField(Viewer, "friendInvite", (t) =>
  t.field({
    type: FriendInviteType,
    nullable: true,
    description:
      "Your invite link, or null if you have not made one " +
      "(`ensureFriendInvite`).",
    resolve: (viewer, _args, context) =>
      context.actor(UserActorDescriptor, viewer.id).friendInvite(),
  }),
);

builder.mutationField("ensureFriendInvite", (t) =>
  t.field({
    type: FriendInviteType,
    description: "Your invite link, made on first use. Idempotent.",
    errors: {},
    resolve: (_root, _args, context) =>
      myUserActor(context, "invite a friend").ensureFriendInvite(),
  }),
);

builder.mutationField("resetFriendInvite", (t) =>
  t.field({
    type: FriendInviteType,
    description: "A new invite link. Every earlier link stops working.",
    errors: {},
    resolve: (_root, _args, context) =>
      myUserActor(context, "reset your invite link").resetFriendInvite(),
  }),
);

builder.mutationField("acceptFriendInvite", (t) =>
  t.field({
    type: AcceptFriendInvitePayloadType,
    description:
      "Become friends with the person whose link this is. Idempotent. " +
      "Writes your `friends` row now; theirs follows through the outbox.",
    errors: {},
    args: { token: t.arg.string({ required: true }) },
    resolve: (_root, args, context) =>
      myUserActor(context, "accept an invite").acceptFriendInvite(
        requireToken(args.token),
      ),
  }),
);
