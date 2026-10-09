/**
 * Home "Today" (roadmap X10): the three reads Home adds to `Viewer`.
 *
 * - **`openBottles`** — Continue: the viewer's open bottles across every
 *   cellar they created or co-own (`CellarsCollectionActor.openBottles`).
 *   Each is a `CellarItem`, which now names its `cellar` too.
 * - **`aiJobs`** — the job tray and the "Waiting on you" inbox: label reads,
 *   menu scans, recipe photos and tier-list insights, running or recently
 *   settled (`AiJobsCollectionActor`). Failures carry N07's typed outcome,
 *   never the stored message.
 * - **`friendsFeed`** lives in `discovery.ts`, beside `recentActivity`, whose
 *   entry type it shares.
 *
 * All hang off `Viewer` because each is the viewer's own view, with no
 * argument for whose.
 */
import type { AiJobDto, CellarItemDto } from "@cellar-assistant/contracts";
import {
  AI_JOB_KINDS,
  AI_JOB_STATUSES,
  AiJobsCollectionActorDescriptor,
  CellarsCollectionActorDescriptor,
  offsetPage,
  viewerCollectionActorId,
} from "@cellar-assistant/contracts";
import { builder } from "./builder.ts";
import { CellarItemConnection, CellarItemType, CellarType } from "./cellar.ts";
import { ActorErrorCodeEnum, ActorErrorReasonEnum } from "./errors.ts";
import { ItemTypeEnum } from "./item.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";
import { Viewer } from "./viewer.ts";

/* -------------------------------------------------------------------------- */
/* Continue                                                                    */
/* -------------------------------------------------------------------------- */

builder.objectField(CellarItemType, "cellar", (t) =>
  t.field({
    type: CellarType,
    nullable: true,
    description:
      "The cellar this bottle is in, through the `Cellar` loader — which " +
      "applies `canSeeCellar` again, so a bottle reached some other way never " +
      "names a cellar its viewer may not see.",
    resolve: (bottle: CellarItemDto) => bottle.cellarId,
  }),
);

builder.objectField(Viewer, "openBottles", (t) =>
  t.field({
    type: CellarItemConnection,
    description:
      "Home's Continue shelf (X10): open bottles (opened, not finished) in " +
      "cellars you created or co-own, most recently opened first. A friend's " +
      "open bottle is not listed — it is not yours to pour.",
    args: t.arg.connectionArgs(),
    resolve: async (viewer, args, context) =>
      connectionFromPage(
        await context
          .actor(
            CellarsCollectionActorDescriptor,
            viewerCollectionActorId(viewer.id),
          )
          .openBottles(toPageArgs(args)),
      ),
  }),
);

/* -------------------------------------------------------------------------- */
/* AI jobs                                                                     */
/* -------------------------------------------------------------------------- */

const AiJobKindEnum = builder.enumType("AiJobKind", {
  description:
    "Which AI work: a bottle's LABEL_READ, a MENU_SCAN, a RECIPE_PHOTO, or a " +
    "tier list's TIER_LIST_INSIGHTS.",
  values: AI_JOB_KINDS,
});

const AiJobStatusEnum = builder.enumType("AiJobStatus", {
  description:
    "RUNNING: asked for, not answered yet. READY: answered — a draft, a " +
    "menu's lines, a recipe or insights wait for you. FAILED: the latest " +
    "attempt failed (`failureCode` / `failureReason`).",
  values: AI_JOB_STATUSES,
});

const AiJobType = builder.objectRef<AiJobDto>("AiJob").implement({
  description:
    "One piece of your AI work (X10). Exactly the fields its `kind` names " +
    "are set; the rest are null.",
  fields: (t) => ({
    id: t.exposeID("id", {
      description:
        "`<kind>:<subjectId>` — stable across reads, so a client can tell " +
        "what changed since it last asked.",
    }),
    kind: t.field({ type: AiJobKindEnum, resolve: (job) => job.kind }),
    status: t.field({ type: AiJobStatusEnum, resolve: (job) => job.status }),
    subjectId: t.exposeID("subjectId", {
      description: "The onboarding, menu scan, job or tier list id.",
    }),
    itemType: t.field({
      type: ItemTypeEnum,
      nullable: true,
      description: "LABEL_READ: what kind of bottle.",
      resolve: (job) => job.itemType,
    }),
    placeId: t.exposeID("placeId", {
      nullable: true,
      description:
        "MENU_SCAN: the scan's place, when you may see it (a place under " +
        "review is its creator's alone).",
    }),
    placeName: t.exposeString("placeName", { nullable: true }),
    count: t.exposeInt("count", {
      nullable: true,
      description: "MENU_SCAN, READY: lines read.",
    }),
    tierListName: t.exposeString("tierListName", { nullable: true }),
    recipeId: t.exposeID("recipeId", {
      nullable: true,
      description: "RECIPE_PHOTO, READY: the recipe it made.",
    }),
    recipeName: t.exposeString("recipeName", { nullable: true }),
    startedAt: t.expose("startedAt", { type: "DateTime" }),
    finishedAt: t.expose("finishedAt", {
      type: "DateTime",
      nullable: true,
      description: "When it became READY or FAILED; null while RUNNING.",
    }),
    failureCode: t.field({
      type: ActorErrorCodeEnum,
      nullable: true,
      description:
        "FAILED: the stored failure's classification, or null when it had " +
        "none. The failure's message is never exposed.",
      resolve: (job) => job.failureCode,
    }),
    failureReason: t.field({
      type: ActorErrorReasonEnum,
      nullable: true,
      resolve: (job) => job.failureReason,
    }),
    retryAt: t.expose("retryAt", {
      type: "DateTime",
      nullable: true,
      description: "FAILED on a budget: when asking again can first succeed.",
    }),
  }),
});

const AiJobConnection = builder.connectionObject(
  { type: AiJobType, name: "AiJobConnection" },
  { name: "AiJobEdge" },
);

builder.objectField(Viewer, "aiJobs", (t) =>
  t.field({
    type: AiJobConnection,
    description:
      "Your AI work (X10): label reads, menu scans, recipe photos and " +
      "tier-list insights — running in the last day, or settled in the last " +
      "three — newest first. The actor holds at most 30; `first`/`after` " +
      "page that set. Home's job tray and its Waiting on you inbox read this.",
    args: t.arg.connectionArgs(),
    resolve: async (viewer, args, context) =>
      connectionFromPage(
        offsetPage(
          await context
            .actor(
              AiJobsCollectionActorDescriptor,
              viewerCollectionActorId(viewer.id),
            )
            .list(),
          toPageArgs(args),
        ),
      ),
  }),
);
