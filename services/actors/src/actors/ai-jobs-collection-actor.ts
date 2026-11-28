/**
 * `AiJobsCollectionActor(viewerId)` — Home's job tray and "Waiting on you"
 * (roadmap X10). Contract and the meaning of each status:
 * `packages/contracts/src/ai-jobs.ts`.
 *
 * Four reads, one per kind of AI work, each against the table that already
 * records that work's state — nothing new is written anywhere:
 *
 * | kind                 | table              | RUNNING                      | READY                    | FAILED                     |
 * |----------------------|--------------------|------------------------------|--------------------------|----------------------------|
 * | `LABEL_READ`         | `item_onboardings` | `START`, under 15 min old    | `COMPLETED` (a draft)    | — (see below)              |
 * | `MENU_SCAN`          | `menu_scans`       | reading, or matching (N06a)  | `completed`, matched     | `failed`, `processing_error` |
 * | `RECIPE_PHOTO`       | `jobs`             | `pending` / `running`        | `completed`              | `failed`, `last_error`     |
 * | `TIER_LIST_INSIGHTS` | `tier_lists`       | N07 `PENDING`, not deferred  | N07 `READY`              | N07 `FAILED`               |
 *
 * A menu scan stays RUNNING after extraction while its matches are still
 * being found (N06a's `queued` / `running`): `processing_status` turns
 * `completed` before a single line is matched, and calling that READY would
 * toast "the menu is read" and stop the watcher just before the matches —
 * the part Home's "Waiting on you" exists for — arrive.
 *
 * A failed label read is left out: the onboarding row keeps no reason, and
 * the person was told at the time, in the add flow that was waiting on it.
 * Every other failure crosses as N07's typed outcome, parsed from the stored
 * `CODE[REASON]: message` (`parseStoredFailure`); a string in any other shape
 * reads as "no classification", which the client words as retryable.
 *
 * **Authorization** is the C3 rule: keyed by the viewer, refusing any other
 * caller on every turn before reading (`ViewerCollectionActorBase`), and
 * every statement filtered to the viewer's own rows. A scan's place is named
 * only when the viewer may see it (X27: a place under review is its
 * creator's alone).
 */
import type {
  ActorCategory,
  AiJobDto,
  AiJobKind,
  AiJobStatus,
  AiJobsCollectionActorInterface,
  Ctx,
  ItemType,
} from "@cellar-assistant/contracts";
import {
  AI_JOB_LABEL_READ_STALE_MS,
  AI_JOB_LIMIT,
  AI_JOB_RUNNING_WINDOW_MS,
  AI_JOB_SETTLED_WINDOW_MS,
  AiJobsCollectionActorDescriptor,
  isItemType,
  parseStoredFailure,
  RECIPE_PHOTO_JOB_KIND,
} from "@cellar-assistant/contracts";
import { type SQL, sql } from "@cellar-assistant/db/orm";
import { aiCapabilities } from "../lib/ai/capabilities.ts";
import { ViewerCollectionActorBase } from "../lib/collection-actor-base.ts";
import { toIso, uuidArray } from "../lib/collection-sql.ts";
import { OUTBOX_TARGETS } from "../lib/outbox-targets.ts";
import { tierListInsightsStatus } from "../lib/tier-list-insights-status.ts";
import { placeRefVisibleToSql } from "../lib/unshared-places.ts";
import { menuMatchJobId } from "./menu-scan-actor.ts";
import {
  INSIGHTS_THROTTLE_MS,
  MIN_ITEMS_FOR_INSIGHTS,
} from "./tier-list-actor.ts";

type Stamp = Date | string | null;

type LabelReadRow = {
  readonly id: string;
  readonly status: string;
  readonly item_type: string;
  readonly created_at: Stamp;
  readonly updated_at: Stamp;
};

type MenuScanRow = {
  readonly id: string;
  readonly processing_status: string;
  readonly processing_error: string | null;
  readonly items_detected: number | null;
  readonly started_at: Stamp;
  readonly finished_at: Stamp;
  readonly place_id: string | null;
  readonly place_name: string | null;
  /** The place the scan files against, visible to the viewer or not. */
  readonly effective_place_id: string | null;
};

type RecipePhotoRow = {
  readonly id: string;
  readonly status: string;
  readonly last_error: string | null;
  readonly created_at: Stamp;
  readonly finished_at: Stamp;
  readonly recipe_id: string | null;
  readonly recipe_name: string | null;
};

type InsightsRow = {
  readonly id: string;
  readonly name: string;
  readonly has_insights: boolean;
  readonly item_count: number;
  readonly insights_requested_at: Stamp;
  readonly insights_generated_at: Stamp;
  readonly insights_failed_at: Stamp;
  readonly insights_failure: string | null;
  readonly insights_retry_at: Stamp;
};

const iso = (value: Stamp): string | null => toIso(value);

const date = (value: Stamp): Date | null => {
  const at = iso(value);
  return at === null ? null : new Date(at);
};

const intervalMs = (ms: number) => sql`make_interval(secs => ${ms / 1000})`;

/** A job with every optional field empty, for each kind to fill in. */
const job = (
  kind: AiJobKind,
  subjectId: string,
  status: AiJobStatus,
  startedAt: string,
  finishedAt: string | null,
): AiJobDto => ({
  id: `${kind}:${subjectId}`,
  kind,
  status,
  subjectId,
  itemType: null,
  placeId: null,
  placeName: null,
  count: null,
  tierListName: null,
  recipeId: null,
  recipeName: null,
  startedAt,
  finishedAt,
  failureCode: null,
  failureReason: null,
  retryAt: null,
});

/** N07's classification of a stored failure; nothing for an unclassified one. */
const failureOf = (
  stored: string | null,
): Pick<AiJobDto, "failureCode" | "failureReason"> => {
  if (stored === null) return { failureCode: null, failureReason: null };
  const parsed = parseStoredFailure(stored);
  return { failureCode: parsed.code, failureReason: parsed.reason };
};

/** Newest activity first: when it finished, or when it started. */
const newestFirst = (a: AiJobDto, b: AiJobDto): number => {
  const left = a.finishedAt ?? a.startedAt;
  const right = b.finishedAt ?? b.startedAt;
  if (left !== right) return left < right ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

export class AiJobsCollectionActor
  extends ViewerCollectionActorBase<null>
  implements AiJobsCollectionActorInterface
{
  static readonly category: ActorCategory =
    AiJobsCollectionActorDescriptor.category;

  async list(ctx: Ctx): Promise<readonly AiJobDto[]> {
    return await this.batch(ctx, null, [], async () => {
      const viewer = ctx.viewerId;
      if (viewer === null) return [];
      const now = new Date();
      const jobs = [
        ...(await this.#labelReads(viewer)),
        ...(await this.#menuScans(viewer)),
        ...(await this.#recipePhotos(viewer)),
        ...(await this.#insights(viewer, now)),
      ];
      return jobs.sort(newestFirst).slice(0, AI_JOB_LIMIT);
    });
  }

  /**
   * `startItemOnboarding` reads inside its own request, so `START` means
   * "reading now" only for a few minutes; older, it was abandoned. A
   * `COMPLETED` session that was never confirmed or closed is a draft
   * waiting to be checked.
   */
  async #labelReads(viewer: string): Promise<AiJobDto[]> {
    const { rows } = await this.db.execute<LabelReadRow>(sql`
      select o.id, o.status, o.item_type, o.created_at, o.updated_at
      from public.item_onboardings o
      where o.user_id = ${viewer}::uuid
        and (
          (o.status = 'START'
            and o.created_at > now() - ${intervalMs(AI_JOB_LABEL_READ_STALE_MS)})
          or (o.status = 'COMPLETED'
            and o.updated_at > now() - ${intervalMs(AI_JOB_SETTLED_WINDOW_MS)})
        )
      order by o.updated_at desc, o.id desc
      limit ${AI_JOB_LIMIT}
    `);
    return rows.flatMap((row): AiJobDto[] => {
      const startedAt = iso(row.created_at);
      if (startedAt === null) return [];
      const running = row.status === "START";
      const itemType: ItemType | null = isItemType(row.item_type)
        ? row.item_type
        : null;
      return [
        {
          ...job(
            "LABEL_READ",
            row.id,
            running ? "RUNNING" : "READY",
            startedAt,
            running ? null : iso(row.updated_at),
          ),
          itemType,
        },
      ];
    });
  }

  async #menuScans(viewer: string): Promise<AiJobDto[]> {
    const placeId = sql`coalesce(s.manual_place_override, s.place_id, s.estimated_place_id)`;
    const { rows } = await this.db.execute<MenuScanRow>(sql`
      select s.id, s.processing_status, s.processing_error, s.items_detected,
             coalesce(s.scanned_at, s.created_at) as started_at,
             coalesce(s.processed_at, s.updated_at) as finished_at,
             p.id as place_id, p.name as place_name,
             ${placeId} as effective_place_id
      from public.menu_scans s
      left join public.places p
        on p.id = ${placeId}
       and ${placeRefVisibleToSql(viewer, sql`p.id`)}
      where s.user_id = ${viewer}::uuid
        and (
          (s.processing_status in ('pending', 'processing')
            and coalesce(s.scanned_at, s.created_at)
              > now() - ${intervalMs(AI_JOB_RUNNING_WINDOW_MS)})
          or (s.processing_status in ('completed', 'failed')
            and coalesce(s.processed_at, s.updated_at)
              > now() - ${intervalMs(AI_JOB_SETTLED_WINDOW_MS)})
        )
      order by coalesce(s.processed_at, s.updated_at) desc, s.id desc
      limit ${AI_JOB_LIMIT}
    `);
    const matching = await this.#stillMatching(
      rows
        .filter(
          (row) =>
            row.processing_status === "completed" &&
            row.effective_place_id !== null &&
            (row.items_detected ?? 0) > 0,
        )
        .map((row) => row.id),
    );
    return rows.flatMap((row): AiJobDto[] => {
      const startedAt = iso(row.started_at);
      if (startedAt === null) return [];
      const status: AiJobStatus =
        row.processing_status === "completed"
          ? matching.has(row.id)
            ? "RUNNING"
            : "READY"
          : row.processing_status === "failed"
            ? "FAILED"
            : "RUNNING";
      return [
        {
          ...job(
            "MENU_SCAN",
            row.id,
            status,
            startedAt,
            status === "RUNNING" ? null : iso(row.finished_at),
          ),
          placeId: row.place_id,
          placeName: row.place_name,
          count: status === "READY" ? (row.items_detected ?? 0) : null,
          ...(status === "FAILED" ? failureOf(row.processing_error) : {}),
        },
      ];
    });
  }

  /**
   * Which of these extracted scans are still being matched — N06a's
   * `queued` or `running` (`deriveMatchStatus`), read for the whole set at
   * once: the scan's `menu-match` job exists and has not finished, or there
   * is no job yet and a live outbox row will start one. Anything else (a
   * finished, failed or cancelled job; a dead outbox row; a scan matched
   * before jobs existed) has settled.
   */
  async #stillMatching(scanIds: readonly string[]): Promise<Set<string>> {
    if (scanIds.length === 0) return new Set();
    const jobIds = scanIds.map(menuMatchJobId);
    const match = OUTBOX_TARGETS["MenuScanActor.match"];
    const start = OUTBOX_TARGETS["MenuMatchJobActor.start"];
    const live = (target: SQL): SQL => sql`exists (
      select 1 from public.outbox o
      where o.status in ('pending', 'delivering') and ${target}
    )`;
    const { rows } = await this.db.execute<{ scan_id: string }>(sql`
      select s.scan_id::text as scan_id
      from unnest(${uuidArray(scanIds, "menu scan id")},
                  ${uuidArray(jobIds, "menu match job id")})
        as s(scan_id, job_id)
      left join public.jobs j on j.id = s.job_id
      where j.status in ('pending', 'running')
         or (j.id is null and (
              ${live(sql`o.target_actor = ${match.actorType}
                and o.method = ${match.method}
                and o.target_id = s.scan_id::text`)}
           or ${live(sql`o.target_actor = ${start.actorType}
                and o.method = ${start.method}
                and o.target_id = s.job_id::text`)}))
    `);
    return new Set(rows.map((row) => row.scan_id));
  }

  async #recipePhotos(viewer: string): Promise<AiJobDto[]> {
    const { rows } = await this.db.execute<RecipePhotoRow>(sql`
      select j.id, j.status, j.last_error, j.created_at,
             coalesce(j.finished_at, j.updated_at) as finished_at,
             j.cursor ->> 'recipeId' as recipe_id,
             j.cursor -> 'extraction' ->> 'name' as recipe_name
      from public.jobs j
      where j.kind = ${RECIPE_PHOTO_JOB_KIND}
        and j.created_by = ${viewer}::uuid
        and (
          (j.status in ('pending', 'running')
            and j.created_at > now() - ${intervalMs(AI_JOB_RUNNING_WINDOW_MS)})
          or (j.status in ('completed', 'failed')
            and coalesce(j.finished_at, j.updated_at)
              > now() - ${intervalMs(AI_JOB_SETTLED_WINDOW_MS)})
        )
      order by coalesce(j.finished_at, j.updated_at) desc, j.id desc
      limit ${AI_JOB_LIMIT}
    `);
    return rows.flatMap((row): AiJobDto[] => {
      const startedAt = iso(row.created_at);
      if (startedAt === null) return [];
      const status: AiJobStatus =
        row.status === "completed"
          ? "READY"
          : row.status === "failed"
            ? "FAILED"
            : "RUNNING";
      return [
        {
          ...job(
            "RECIPE_PHOTO",
            row.id,
            status,
            startedAt,
            status === "RUNNING" ? null : iso(row.finished_at),
          ),
          // The recipe exists only once the chain completed; before that the
          // cursor's id is minted but nothing is behind it.
          recipeId: status === "READY" ? row.recipe_id : null,
          recipeName: row.recipe_name,
          ...(status === "FAILED" ? failureOf(row.last_error) : {}),
        },
      ];
    });
  }

  /**
   * N07's status, through the same function `TierListActor` answers
   * `insightsStatus` with. `PENDING` is RUNNING only when nothing defers it:
   * a list waiting out the once-a-day throttle or a budget window is not
   * work in progress, and the tray would show it for a day.
   */
  async #insights(viewer: string, now: Date): Promise<AiJobDto[]> {
    const { rows } = await this.db.execute<InsightsRow>(sql`
      select t.id, t.name, t.ai_insights is not null as has_insights,
             (select count(*) from public.tier_list_items x
               where x.tier_list_id = t.id)::int as item_count,
             t.insights_requested_at, t.insights_generated_at,
             t.insights_failed_at, t.insights_failure, t.insights_retry_at
      from public.tier_lists t
      where t.created_by_id = ${viewer}::uuid
        and greatest(t.insights_requested_at, t.insights_generated_at,
                     t.insights_failed_at)
          > now() - ${intervalMs(AI_JOB_SETTLED_WINDOW_MS)}
      order by greatest(t.insights_requested_at, t.insights_generated_at,
                        t.insights_failed_at) desc, t.id desc
      limit ${AI_JOB_LIMIT}
    `);
    const settledSince = now.getTime() - AI_JOB_SETTLED_WINDOW_MS;
    return rows.flatMap((row): AiJobDto[] => {
      const requestedAt = date(row.insights_requested_at);
      const generatedAt = date(row.insights_generated_at);
      const failedAt = date(row.insights_failed_at);
      const status = tierListInsightsStatus({
        itemCount: Number(row.item_count),
        minimumItems: MIN_ITEMS_FOR_INSIGHTS,
        hasInsights: row.has_insights,
        aiAvailable: aiCapabilities().tierListInsights,
        requestedAt,
        generatedAt,
        failedAt,
        failure: row.insights_failure,
        retryAt: date(row.insights_retry_at),
        throttleMs: INSIGHTS_THROTTLE_MS,
        now,
      });
      const named = (dto: AiJobDto): AiJobDto[] => [
        { ...dto, tierListName: row.name },
      ];
      switch (status.status) {
        case "PENDING": {
          if (status.retryAt !== null || requestedAt === null) return [];
          return named(
            job(
              "TIER_LIST_INSIGHTS",
              row.id,
              "RUNNING",
              requestedAt.toISOString(),
              null,
            ),
          );
        }
        case "READY": {
          if (generatedAt === null || generatedAt.getTime() < settledSince) {
            return [];
          }
          return named(
            job(
              "TIER_LIST_INSIGHTS",
              row.id,
              "READY",
              (requestedAt ?? generatedAt).toISOString(),
              generatedAt.toISOString(),
            ),
          );
        }
        case "FAILED": {
          const finished = failedAt ?? requestedAt;
          if (finished === null || finished.getTime() < settledSince) return [];
          const stored =
            row.insights_failure === null
              ? null
              : parseStoredFailure(row.insights_failure);
          return named({
            ...job(
              "TIER_LIST_INSIGHTS",
              row.id,
              "FAILED",
              (requestedAt ?? finished).toISOString(),
              finished.toISOString(),
            ),
            failureCode: stored?.code ?? null,
            failureReason: status.failureReason,
            retryAt: status.retryAt,
          });
        }
        default:
          return [];
      }
    });
  }
}
