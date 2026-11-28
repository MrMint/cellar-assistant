/**
 * `me` — the signed-in viewer (migration plan A7 acceptance).
 *
 * Every field here comes from the verified JWT's claims, which is why `me`
 * costs no actor call. B4 adds the profile fields (`displayName`, avatar,
 * locale) by calling `UserActor.getProfile`; the token deliberately carries a
 * closed claim set (A6) and is not the place to put them.
 */
import type { AiCapabilities, ItemType } from "@cellar-assistant/contracts";
import {
  FavoritesCollectionActorDescriptor,
  itemActorId,
  mapPage,
  pageArgs,
  UserActorDescriptor,
  viewerCollectionActorId,
} from "@cellar-assistant/contracts";
import type { ViewerClaims } from "../auth/jwt.ts";
import type { ApiContext } from "../context.ts";
import { builder } from "./builder.ts";
import { ItemConnection, ItemTypeEnum } from "./item.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";

const ViewerRole = builder.enumType("ViewerRole", {
  description:
    "A6 collapses the `role` column to exactly these two in the token. " +
    "`system` (plan §8.2) has no representation here by design: no request " +
    "can ever act as the system.",
  values: ["USER", "ADMIN"] as const,
});

/**
 * N07/D25: what this deployment's AI can do. Decided by the actor host at
 * boot from the installed provider; a client hides what is `false` rather
 * than offering it and refusing.
 */
const AiCapabilitiesType = builder
  .objectRef<AiCapabilities>("AiCapabilities")
  .implement({
    description:
      "Which AI-backed features this deployment can serve. False only when " +
      "the configured provider genuinely cannot (no provider at all, or an " +
      "embedding model that cannot embed a photo); hide those features.",
    fields: (t) => ({
      semanticSearch: t.exposeBoolean("semanticSearch", {
        description: "Search by meaning.",
      }),
      imageSearch: t.exposeBoolean("imageSearch", {
        description: "Search by photo (`itemSearch(imageFileId:)`).",
      }),
      labelRead: t.exposeBoolean("labelRead", {
        description: "Reading a label into the add-item form.",
      }),
      menuScan: t.exposeBoolean("menuScan", {
        description: "Reading a photographed menu.",
      }),
      recipePhoto: t.exposeBoolean("recipePhoto", {
        description: "Reading a photographed recipe.",
      }),
      tierListInsights: t.exposeBoolean("tierListInsights", {
        description: "Generated tier-list insights.",
      }),
      detailSuggestions: t.exposeBoolean("detailSuggestions", {
        description:
          "Suggesting an item's missing details from its name (X19, text only).",
      }),
    }),
  });

/**
 * F-87 (H-54): Loved's subtitle, count chips and desktop pane, without paging
 * every favourite to count them. Each count is a page of one from the actor
 * that already counts its rows (`totalCount`, a `count(*)` over the same
 * scope as the page), and only the fields a query selects are read — one
 * actor call each. Null only if that actor ever stops counting cheaply.
 */
const lovedCountOf = (
  viewer: ViewerClaims,
  context: ApiContext,
  types: readonly ItemType[] | null,
): Promise<number | null> =>
  context
    .actor(
      FavoritesCollectionActorDescriptor,
      viewerCollectionActorId(viewer.id),
    )
    .list(pageArgs({ first: 1 }), types)
    .then((page) => page.totalCount);

const LovedCounts = builder.objectRef<ViewerClaims>("LovedCounts").implement({
  description:
    "F-87: how many things the viewer has loved, per kind — Loved's " +
    "subtitle and count chips. Ask only for the counts you show: each is " +
    "one count on the server.",
  fields: (t) => ({
    drinks: t.int({
      nullable: true,
      description: "Every favourited item, all six types.",
      resolve: (viewer, _args, context) => lovedCountOf(viewer, context, null),
    }),
    recipes: t.int({
      nullable: true,
      description: "Loved recipes (D9), the Recipes segment.",
      resolve: (viewer, _args, context) =>
        context
          .actor(UserActorDescriptor, viewer.id)
          .lovedRecipes(pageArgs({ first: 1 }))
          .then((page) => page.totalCount),
    }),
    wine: t.int({
      nullable: true,
      description: "Favourited items of type WINE.",
      resolve: (viewer, _args, context) =>
        lovedCountOf(viewer, context, ["WINE"]),
    }),
    beer: t.int({
      nullable: true,
      description: "Favourited items of type BEER.",
      resolve: (viewer, _args, context) =>
        lovedCountOf(viewer, context, ["BEER"]),
    }),
    spirit: t.int({
      nullable: true,
      description: "Favourited items of type SPIRIT.",
      resolve: (viewer, _args, context) =>
        lovedCountOf(viewer, context, ["SPIRIT"]),
    }),
    coffee: t.int({
      nullable: true,
      description: "Favourited items of type COFFEE.",
      resolve: (viewer, _args, context) =>
        lovedCountOf(viewer, context, ["COFFEE"]),
    }),
    sake: t.int({
      nullable: true,
      description: "Favourited items of type SAKE.",
      resolve: (viewer, _args, context) =>
        lovedCountOf(viewer, context, ["SAKE"]),
    }),
    tea: t.int({
      nullable: true,
      description: "Favourited items of type TEA.",
      resolve: (viewer, _args, context) =>
        lovedCountOf(viewer, context, ["TEA"]),
    }),
  }),
});

export const Viewer = builder.objectRef<ViewerClaims>("Viewer").implement({
  description: "The signed-in user, as their token describes them.",
  fields: (t) => ({
    id: t.exposeID("id"),
    email: t.exposeString("email", { nullable: true }),
    emailVerified: t.exposeBoolean("emailVerified"),
    role: t.field({
      type: ViewerRole,
      resolve: (viewer) => (viewer.role === "admin" ? "ADMIN" : "USER"),
    }),

    aiCapabilities: t.field({
      type: AiCapabilitiesType,
      description:
        "Which AI-backed features this deployment can serve (N07). Hide a " +
        "feature that is false instead of offering it.",
      resolve: (viewer, _args, context) =>
        context.actor(UserActorDescriptor, viewer.id).aiCapabilities(),
    }),

    /**
     * The worked example of §1.5 end to end: a collection actor returns a page
     * of typed ids, and the resolver hands those ids to the `Item` loader,
     * which batches them into parallel `ItemActor.get` calls.
     *
     * Both halves have landed: `FavoritesCollectionActor` in C3 (§2.2, keyed
     * by the viewer and refusing any other caller on every turn) and
     * `ItemActor` in B2.
     */
    lovedCounts: t.field({
      type: LovedCounts,
      description:
        "F-87: per-kind counts of what the viewer has loved (Loved's " +
        "subtitle and chips), without paging `favorites` to count it.",
      resolve: (viewer) => viewer,
    }),
    favorites: t.field({
      type: ItemConnection,
      description: "The viewer's favourited items (/favorites).",
      args: {
        ...t.arg.connectionArgs(),
        types: t.arg({
          type: [ItemTypeEnum],
          required: false,
          description:
            "Only these item types (UI parity G25); omitted or empty means all " +
            "six. Filters before paging, so `totalCount` follows it.",
        }),
      },
      resolve: async (viewer, args, context) => {
        const page = await context
          .actor(
            FavoritesCollectionActorDescriptor,
            viewerCollectionActorId(viewer.id),
          )
          // `?? null`: an omitted arg is `undefined`, which does not survive
          // `JSON.stringify` on the way to the sidecar.
          .list(toPageArgs(args), args.types ?? null);
        // Ids, not objects: the loader turns them into items.
        return connectionFromPage(mapPage(page, itemActorId));
      },
    }),
  }),
});

builder.queryField("me", (t) =>
  t.field({
    type: Viewer,
    nullable: true,
    description: "The signed-in viewer, or null for an anonymous request.",
    resolve: (_root, _args, context) => context.viewer,
  }),
);
