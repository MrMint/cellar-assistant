/**
 * Profile edges — UI parity G4.
 *
 * The old UI read `createdBy { displayName avatarUrl }`, `co_owners { user }`
 * and a review's or check-in's `user { … }` straight off the row, through
 * Hasura relationships. The new rows carry the ids (`createdById`,
 * `coOwnerIds`, `userId`); these fields turn each id into a `UserProfile`.
 *
 * ## Why this costs one batch, not one call per row
 *
 * Every edge resolves to a **user id** and lets the `UserProfile` DataLoader
 * (`./user.ts`) do the rest: Pothos collects every id asked for in one tick,
 * deduplicates them, and calls `UserActor.getProfile` once per *distinct* user
 * — so a page of twenty cellars that share one creator costs one profile read,
 * not twenty. `profile-edges.test.ts` counts those calls.
 *
 * ## Whose rules
 *
 * Nothing here decides visibility, which is the point of hanging the edges off
 * objects rather than adding root fields:
 *
 * - **The parent has already been allowed.** A `Cellar` only exists in a
 *   response after `CellarActor.get` passed `canSeeCellar`; a `TierList` after
 *   `canSeeTierList`; a review or check-in after its own list's rule. An edge
 *   can never be reached from an object the viewer was refused.
 * - **The profile keeps its own rule.** `UserActor.getProfile` is readable by
 *   any signed-in viewer and nulls `email` for anybody but the owner. An
 *   anonymous viewer — who can see a PUBLIC cellar — gets `null` (and an
 *   empty co-owner list) *without* a call, rather than a refusal in `errors`.
 *
 * Its own module, imported after `user.ts`, because it needs refs from five
 * schema modules and `builder.objectField` needs each ref to exist first.
 */
import { offsetPage } from "@cellar-assistant/contracts";
import type { ApiContext } from "../context.ts";
import { builder } from "./builder.ts";
import { CellarType, CheckInType } from "./cellar.ts";
import { ItemCheckInType, ItemReviewType } from "./item.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";
import { RecipeReviewType, RecipeType_ } from "./recipe.ts";
import { TierListType } from "./tier-list.ts";
import { UserProfileType } from "./user.ts";

/** The id to load, or `null` for an anonymous viewer (see the module doc). */
const profileOf = (userId: string, context: ApiContext): string | null =>
  context.ctx.viewerId === null ? null : userId;

const UserProfileConnection = builder.connectionObject(
  { type: UserProfileType, name: "UserProfileConnection" },
  { name: "UserProfileEdge" },
);

builder.objectFields(CellarType, (t) => ({
  createdBy: t.field({
    type: UserProfileType,
    nullable: true,
    description:
      "The creator's profile. Null for an anonymous viewer: profiles are for " +
      "signed-in viewers only.",
    resolve: (cellar, _args, context) => profileOf(cellar.createdById, context),
  }),
  coOwners: t.field({
    type: UserProfileConnection,
    description:
      "Co-owners' profiles, in `coOwnerIds` order — the creator is not among " +
      "them. Empty for an anonymous viewer.",
    args: t.arg.connectionArgs(),
    resolve: (cellar, args, context) =>
      connectionFromPage(
        offsetPage(
          context.ctx.viewerId === null ? [] : cellar.coOwnerIds,
          toPageArgs(args),
        ),
      ),
  }),
}));

builder.objectField(TierListType, "createdBy", (t) =>
  t.field({
    type: UserProfileType,
    nullable: true,
    description: "The creator's profile. Null for an anonymous viewer.",
    resolve: (tierList, _args, context) =>
      profileOf(tierList.createdById, context),
  }),
);

builder.objectField(ItemReviewType, "user", (t) =>
  t.field({
    type: UserProfileType,
    nullable: true,
    description: "Who wrote the review.",
    resolve: (review, _args, context) => profileOf(review.userId, context),
  }),
);

builder.objectField(CheckInType, "user", (t) =>
  t.field({
    type: UserProfileType,
    nullable: true,
    description:
      "Who the check-in is about — not necessarily who wrote it " +
      "(`bulkCheckIn`).",
    resolve: (checkIn, _args, context) => profileOf(checkIn.userId, context),
  }),
);

builder.objectField(ItemCheckInType, "user", (t) =>
  t.field({
    type: UserProfileType,
    nullable: true,
    description: "Who the check-in is about.",
    resolve: (checkIn, _args, context) => profileOf(checkIn.userId, context),
  }),
);

builder.objectField(RecipeReviewType, "user", (t) =>
  t.field({
    type: UserProfileType,
    nullable: true,
    description: "Who wrote the review.",
    resolve: (review, _args, context) => profileOf(review.userId, context),
  }),
);

/**
 * UI parity wave C — the versions tab's and the group page's "created by"
 * (the old `created_by_user { displayName avatarUrl }`). `recipes.created_by`
 * is nullable and `ON DELETE SET NULL`, so a recipe whose author is gone has
 * no profile, rather than an error.
 */
builder.objectField(RecipeType_, "createdBy", (t) =>
  t.field({
    type: UserProfileType,
    nullable: true,
    description:
      "The author's profile. Null when the author is gone, and for an " +
      "anonymous viewer.",
    resolve: (recipe, _args, context) =>
      recipe.createdById === null
        ? null
        : profileOf(recipe.createdById, context),
  }),
);
