/**
 * Every event the actor host emits: its name, the severities it is emitted at,
 * and the attributes it carries. `emit` accepts nothing else (`./telemetry.ts`),
 * and `events.test.ts` holds two more things to it:
 *
 *  1. **the code agrees with it** — a scan of every emit site in `src/` finds
 *     each event's attributes, and a catalog entry may neither name an
 *     attribute no site emits nor miss one a site does;
 *  2. **the alerts agree with it** — every `event_name` a rule in
 *     `infra/grafana/provisioning/alerting/*.yaml` filters on is an entry here
 *     (for its `service_name`), and every other label the rule filters on is
 *     one of that event's attributes, with Loki's dots-to-underscores applied.
 *
 * ## Why the second half exists
 *
 * Alert YAML keys on strings, and nothing connected those strings to the code.
 * The first removeFriendOtherSide rule filtered on `method`; the attribute is
 * `outbox.method`, which Loki stores as `outbox_method`, so the rule matched
 * nothing — silently, and indistinguishably from "no dead letters" — until
 * someone read it against live data (target-stack.md §7). A rename in either
 * place now fails a test instead.
 *
 * ## Attribute names in Loki
 *
 * Log-record attributes become **structured metadata**, filtered after the
 * pipe, with every `.` replaced by `_`: `outbox.method` is queried as
 * `outbox_method`, and `event.name` itself as `event_name`. See the header of
 * `./telemetry.ts`.
 *
 * ## Adding an event
 *
 * Add the entry, then emit it. Keep entries sorted by name. `severity` lists
 * every severity a site emits it at (some are WARN while retrying and ERROR
 * once final). The attribute list is what an operator may filter on, so it
 * must be exactly what the code sends — the scan enforces that.
 */
import type { Severity } from "./telemetry.ts";

export type EventSpec = {
  readonly severity: readonly Severity[];
  readonly attributes: readonly string[];
};

/** `errorAttributes(error)` — class, code and cause class, never the message. */
const ERROR = ["error.name", "error.code", "error.cause"] as const;

/** The outbox's `DrainResult`, one attribute per counter. */
const DRAIN = [
  "reclaimed",
  "claimed",
  "delivered",
  "retried",
  "dead",
  "released",
  "lostClaim",
  "reaped",
  "compensated",
] as const;

/** `maintenance.dead_letters` and its heartbeat carry the same report. */
const DEAD_LETTER_REPORT = [
  "dead",
  "new_dead",
  "acknowledged",
  "regressed",
  "stuck_delivering",
  "target_count",
  "new_target_count",
  "targets_named",
  "targets",
] as const;

export const EVENTS = {
  "actor.app_token_refused": {
    severity: ["WARN"],
    attributes: ["actor.route", "actor.route_kind", "actor.token_presented"],
  },
  "actor.deactivate_unheld": { severity: ["INFO"], attributes: ["actor.type"] },
  "actor.undeclared_route": {
    severity: ["WARN"],
    attributes: [
      "actor.route",
      "actor.route_kind",
      "actor.type",
      "actor.method",
      "actor.refusal",
      "actor.refusal_source",
    ],
  },
  "actor.unexpected_error": {
    severity: ["ERROR"],
    attributes: [
      "actor.route",
      "actor.route_kind",
      "actor.type",
      "actor.method",
      ...ERROR,
      "request.id",
    ],
  },
  "dapr.app_token_unset": { severity: ["WARN"], attributes: [] },
  "db.idle_client_error": { severity: ["WARN"], attributes: [...ERROR] },
  "http.request_failed": {
    severity: ["WARN", "ERROR"],
    attributes: ["http.route", "http.status", ...ERROR],
  },
  "job.batch_failed": {
    severity: ["WARN"],
    attributes: ["job.id", "job.kind", "job.batch", "job.attempts"],
  },
  "job.cancelled": { severity: ["INFO"], attributes: ["job.id", "job.kind"] },
  "job.completed": {
    severity: ["INFO"],
    attributes: ["job.id", "job.kind", "job.batches"],
  },
  "job.failed": {
    severity: ["ERROR"],
    attributes: [
      "job.id",
      "job.kind",
      "job.batch",
      "job.attempts",
      "job.final_reason",
      "outbox.dead_id",
    ],
  },
  "job.kind_mismatch": {
    severity: ["WARN"],
    attributes: ["job.id", "job.kind", "job.expected_kind"],
  },
  "job.started": { severity: ["INFO"], attributes: ["job.id", "job.kind"] },
  "maintenance.cycle_armed": { severity: ["INFO"], attributes: ["armed"] },
  "maintenance.dead_letter_regression": {
    severity: ["ERROR"],
    attributes: ["regressed", "new_dead", "targets_named", "targets"],
  },
  "maintenance.dead_letters": {
    severity: ["ERROR"],
    attributes: [...DEAD_LETTER_REPORT],
  },
  "maintenance.dead_letters_acknowledged": {
    severity: ["INFO"],
    attributes: [
      "acknowledged",
      "superseded",
      "superseded_by",
      "by",
      "target_actor",
      "method",
    ],
  },
  "maintenance.dead_letters_clear": {
    severity: ["INFO"],
    attributes: [...DEAD_LETTER_REPORT],
  },
  "maintenance.reap_scheduled": {
    severity: ["INFO"],
    attributes: ["scheduled"],
  },
  // Two emitters, one name: the keep-alive's arming (`lib/keep-alive.ts`)
  // and the watchdog reminder's own failure (`MaintenanceActor`).
  "maintenance.reminder_armed": { severity: ["INFO"], attributes: [] },
  "maintenance.reminder_failed": { severity: ["ERROR"], attributes: [] },
  "menu_scan.extraction_failed": {
    severity: ["WARN", "ERROR"],
    attributes: ["menu_scan_id", "menu_scan.final_reason"],
  },
  "menu_scan.failed": {
    severity: ["ERROR"],
    attributes: ["menu_scan_id", "menu_scan.final_reason", "outbox.dead_id"],
  },
  "onboarding_reprocess.row_failed": {
    severity: ["WARN"],
    attributes: ["job.id", "onboarding.id"],
  },
  "outbox.dead_letter": {
    severity: ["ERROR"],
    attributes: [
      "outbox.id",
      "outbox.target_actor",
      "outbox.target_id",
      "outbox.method",
      "outbox.attempts",
      "outbox.max_attempts",
      "outbox.reason",
      "outbox.terminal_reason",
      "outbox.compensation",
      "outbox.compensation_id",
    ],
  },
  "outbox.delivery_timeout_raised": {
    severity: ["WARN"],
    attributes: ["outbox.env", "outbox.requested", "outbox.applied"],
  },
  "outbox.drain": { severity: ["INFO"], attributes: [...DRAIN] },
  "outbox.drain_failed": { severity: ["ERROR"], attributes: [] },
  "outbox.env_clamped": {
    severity: ["WARN"],
    attributes: ["outbox.env", "outbox.requested", "outbox.applied"],
  },
  "outbox.heartbeat": {
    severity: ["INFO"],
    attributes: [
      "outbox.pending",
      "outbox.due",
      "outbox.oldest_due_age_s",
      "outbox.delivering",
    ],
  },
  "outbox.lost_claim": {
    severity: ["WARN"],
    attributes: [
      "outbox.id",
      "outbox.target_actor",
      "outbox.method",
      "outbox.outcome",
    ],
  },
  "outbox.reaped": {
    severity: ["INFO"],
    attributes: ["outbox.reaped", "outbox.retention_days"],
  },
  "outbox.reclaimed": {
    severity: ["WARN"],
    attributes: [
      "outbox.id",
      "outbox.target_actor",
      "outbox.method",
      "outbox.attempts",
      "outbox.reason",
    ],
  },
  "outbox.reminder_armed": { severity: ["INFO"], attributes: [] },
  "outbox.reminder_failed": { severity: ["ERROR"], attributes: [] },
  "outbox.retry": {
    severity: ["WARN"],
    attributes: [
      "outbox.id",
      "outbox.target_actor",
      "outbox.target_id",
      "outbox.method",
      "outbox.attempts",
      "outbox.max_attempts",
      "outbox.retry_in_ms",
    ],
  },
  "outbox.target_refused": {
    severity: ["ERROR"],
    attributes: [
      "outbox.id",
      "outbox.target_actor",
      "outbox.target_id",
      "outbox.method",
    ],
  },
  "overture.source_installed": {
    severity: ["INFO"],
    attributes: ["overture.table"],
  },
  "overture_reload.rows_rejected": {
    severity: ["WARN"],
    attributes: ["job.id", "overture.rejected", "overture.batch_rows"],
  },
  "overture_reload.stopped": {
    severity: ["ERROR"],
    attributes: ["job.id", "overture.rejected"],
  },
  "place_refresh.place_failed": {
    severity: ["WARN"],
    attributes: ["job.id", "place.id"],
  },
  "place_refresh.stopped": { severity: ["WARN"], attributes: ["job.id"] },
  "probe.kill": { severity: ["WARN"], attributes: ["job.id", "probe.boot_id"] },
  "probe.reminder_armed": {
    severity: ["INFO"],
    attributes: ["job.id", "probe.boot_id"],
  },
  "probe.reminder_failed": { severity: ["ERROR"], attributes: [] },
  "probe.reminder_fired": {
    severity: ["INFO"],
    attributes: [
      "job.id",
      "probe.boot_id",
      "probe.armed_boot_id",
      "probe.uptime_s",
    ],
  },
  "process.fatal": {
    severity: ["ERROR"],
    attributes: [...ERROR, "process.origin"],
  },
  "process.shutdown_failed": { severity: ["ERROR"], attributes: [...ERROR] },
  "process.unhandled_rejection": {
    severity: ["ERROR"],
    attributes: [...ERROR],
  },
  "recipe_photo.completed": {
    severity: ["INFO"],
    attributes: ["job.id", "recipe.id", "recipe.group_id"],
  },
  "vector_reembed.row_failed": {
    severity: ["WARN"],
    attributes: ["job.id", "vector.id"],
  },
  "vector_reembed.stopped": { severity: ["WARN"], attributes: ["job.id"] },
} as const satisfies Record<string, EventSpec>;

export type EventName = keyof typeof EVENTS;

/** The severities event `N` may be emitted at. */
export type EventSeverity<N extends EventName> =
  (typeof EVENTS)[N]["severity"][number];

/** The attribute keys event `N` may carry. */
export type EventAttributeKey<N extends EventName> =
  (typeof EVENTS)[N]["attributes"][number];
