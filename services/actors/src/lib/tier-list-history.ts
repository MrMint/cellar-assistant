/**
 * D4 — a tier list's edit history, as pure functions over its rows.
 *
 * `tier_list_history` is an append-only log (the migration refuses UPDATE).
 * The owner's edits land as `ADD`, `REMOVE` and `MOVE` rows, each carrying a
 * snapshot of what it changed; Undo and Redo land as `UNDO` / `REDO` rows that
 * name an edit by its `seq`. Nothing is rewritten, so where Undo and Redo
 * stand is not stored anywhere — it is {@link historyStacks}, a replay of the
 * log, and it comes back identical after a reload, a new activation or a new
 * device.
 *
 * The replay is the usual editor rule: an edit pushes onto the undo stack and
 * clears the redo stack; an undo moves the top of the undo stack to the redo
 * stack; a redo moves it back. A log row that does not fit that rule (an
 * `UNDO` naming something that is not on top) is ignored rather than trusted
 * — the actor is the only writer and never writes one, so it would mean a
 * hand edit, and refusing to read the whole history over it would strand the
 * owner's Undo.
 *
 * Applying an edit backwards or forwards is {@link planBandOrders}: every
 * change, whatever its kind, ends as "these bands now hold these ids in this
 * order", and that function turns a wish into the exact orders to write — the
 * ids that no longer exist dropped, anything the wish did not mention kept, so
 * the `0..n-1` positions invariant holds whatever happened since.
 */
import type {
  TierListEditKind,
  TierListEntryRef,
} from "@cellar-assistant/contracts";
import {
  isTierListEntryType,
  MAX_BAND,
  MIN_BAND,
  TIER_LIST_EDIT_KINDS,
} from "@cellar-assistant/contracts";

/** The columns the replay needs; the snapshots stay in the database. */
export type HistoryLogRow = {
  readonly seq: number;
  readonly kind: string;
  readonly targetSeq: number | null;
};

export type HistoryStacks = {
  /** Undoable edits' `seq`s, oldest first — the last one is Undo's. */
  readonly undo: readonly number[];
  /** Redoable edits' `seq`s, oldest first — the last one is Redo's. */
  readonly redo: readonly number[];
  /** The highest `seq` written so far, 0 for an empty log. */
  readonly lastSeq: number;
  /** ADD / REMOVE / MOVE rows ever written, undone ones included. */
  readonly editCount: number;
};

export const isEditKind = (kind: string): kind is TierListEditKind =>
  (TIER_LIST_EDIT_KINDS as readonly string[]).includes(kind);

/** The replay. `rows` in any order; they are read in `seq` order. */
export const historyStacks = (
  rows: readonly HistoryLogRow[],
): HistoryStacks => {
  const undo: number[] = [];
  let redo: number[] = [];
  let lastSeq = 0;
  let editCount = 0;
  const ordered = [...rows].sort((a, b) => a.seq - b.seq);
  for (const row of ordered) {
    lastSeq = Math.max(lastSeq, row.seq);
    if (isEditKind(row.kind)) {
      undo.push(row.seq);
      redo = [];
      editCount += 1;
    } else if (row.kind === "UNDO") {
      if (undo.length > 0 && undo[undo.length - 1] === row.targetSeq) {
        redo.push(undo.pop() ?? row.targetSeq);
      }
    } else if (row.kind === "REDO") {
      if (redo.length > 0 && redo[redo.length - 1] === row.targetSeq) {
        undo.push(redo.pop() ?? row.targetSeq);
      }
    }
  }
  return { undo, redo, lastSeq, editCount };
};

/* -------------------------------------------------------------------------- */
/* What an edit's row carries                                                  */
/* -------------------------------------------------------------------------- */

/** A `tier_list_items` row as an ADD or REMOVE recorded it. */
export type EntrySnapshot = {
  readonly id: string;
  readonly entry: TierListEntryRef;
  readonly band: number;
  readonly position: number;
  readonly notes: string | null;
  readonly createdAt: string | null;
};

/** One band's full order, by `tier_list_items.id`, keyed by band. */
export type BandOrders = Readonly<Record<string, readonly string[]>>;

/** The entry a MOVE is about, when one entry can be singled out. */
export type MoveSubject = {
  readonly id: string;
  readonly entry: TierListEntryRef;
  readonly fromBand: number;
  readonly toBand: number;
};

export type EntryChange = {
  readonly kind: "ADD" | "REMOVE";
  readonly row: EntrySnapshot;
};

export type MoveChange = {
  readonly kind: "MOVE";
  /** Every band the move touched, as it was before … */
  readonly before: BandOrders;
  /** … and after. Undo writes `before`, Redo writes `after`. */
  readonly after: BandOrders;
  readonly subject: MoveSubject | null;
};

export type EditChange = EntryChange | MoveChange;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isBand = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= MIN_BAND &&
  value <= MAX_BAND;

const parseEntryRef = (value: unknown): TierListEntryRef | null => {
  if (!isRecord(value)) return null;
  const { type, id } = value;
  return typeof type === "string" &&
    isTierListEntryType(type) &&
    typeof id === "string"
    ? { type, id }
    : null;
};

const parseSnapshot = (value: unknown): EntrySnapshot | null => {
  if (!isRecord(value)) return null;
  const entry = parseEntryRef(value.entry);
  const { id, band, position, notes, createdAt } = value;
  if (
    entry === null ||
    typeof id !== "string" ||
    !isBand(band) ||
    typeof position !== "number"
  ) {
    return null;
  }
  return {
    id,
    entry,
    band,
    position,
    notes: typeof notes === "string" ? notes : null,
    createdAt: typeof createdAt === "string" ? createdAt : null,
  };
};

const parseBandOrders = (value: unknown): BandOrders | null => {
  if (!isRecord(value)) return null;
  const orders: Record<string, readonly string[]> = {};
  for (const [band, ids] of Object.entries(value)) {
    if (!isBand(Number(band)) || !Array.isArray(ids)) return null;
    if (!ids.every((id): id is string => typeof id === "string")) return null;
    orders[band] = ids;
  }
  return orders;
};

const parseSubject = (value: unknown): MoveSubject | null => {
  if (!isRecord(value)) return null;
  const entry = parseEntryRef(value.entry);
  const { id, fromBand, toBand } = value;
  return entry !== null &&
    typeof id === "string" &&
    isBand(fromBand) &&
    isBand(toBand)
    ? { id, entry, fromBand, toBand }
    : null;
};

/**
 * A history row's `change`, checked. `null` for a row that is not an edit or
 * whose snapshot does not parse — the caller treats that edit as one it can
 * no longer apply, rather than guessing.
 */
export const parseChange = (kind: string, raw: unknown): EditChange | null => {
  if (!isRecord(raw)) return null;
  if (kind === "ADD" || kind === "REMOVE") {
    const row = parseSnapshot(raw.row);
    return row === null ? null : { kind, row };
  }
  if (kind === "MOVE") {
    const before = parseBandOrders(raw.before);
    const after = parseBandOrders(raw.after);
    if (before === null || after === null) return null;
    return { kind, before, after, subject: parseSubject(raw.subject) };
  }
  return null;
};

/* -------------------------------------------------------------------------- */
/* Applying one                                                                */
/* -------------------------------------------------------------------------- */

export type Placement = {
  readonly id: string;
  readonly band: number;
  readonly position: number;
};

const ordersOf = (rows: readonly Placement[]): Map<number, string[]> => {
  const byBand = new Map<number, Placement[]>();
  for (const row of rows) {
    const list = byBand.get(row.band) ?? [];
    list.push(row);
    byBand.set(row.band, list);
  }
  const orders = new Map<number, string[]>();
  for (const [band, list] of byBand) {
    orders.set(
      band,
      [...list]
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
        .map((row) => row.id),
    );
  }
  return orders;
};

const sameOrder = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, index) => b[index] === id);

/**
 * The orders to write so that each band in `desired` holds what it asks for,
 * as nearly as the list's current rows allow:
 *
 * - an id that is no longer on the list is dropped from the wish;
 * - an id named in two bands lands in the higher of them;
 * - a current member of a wished-for band the wish does not mention stays
 *   in that band, after the wished-for ids, in its current order;
 * - a band the wish does not name loses whatever moved out of it, and
 *   keeps the rest in order.
 *
 * Returns only the bands whose order actually changes, each complete, so the
 * caller writes positions `0..n-1` per returned band and nothing else.
 */
export const planBandOrders = (
  current: readonly Placement[],
  desired: BandOrders,
): Map<number, string[]> => {
  const present = new Set(current.map((row) => row.id));
  const before = ordersOf(current);

  const wished = new Map<number, string[]>();
  const claimed = new Set<string>();
  const bands = Object.keys(desired)
    .map(Number)
    .filter(isBand)
    .sort((a, b) => b - a);
  for (const band of bands) {
    const ids: string[] = [];
    for (const id of desired[String(band)] ?? []) {
      if (!present.has(id) || claimed.has(id)) continue;
      claimed.add(id);
      ids.push(id);
    }
    wished.set(band, ids);
  }

  const touched = new Set<number>(wished.keys());
  for (const row of current) {
    if (claimed.has(row.id)) touched.add(row.band);
  }

  const plan = new Map<number, string[]>();
  for (const band of touched) {
    const was = before.get(band) ?? [];
    const head = wished.get(band) ?? [];
    const kept = was.filter((id) => !claimed.has(id));
    const next = [...head, ...kept];
    if (!sameOrder(was, next)) plan.set(band, next);
  }
  return plan;
};

/** `ids` with `id` placed at `position` (clamped), any earlier copy removed. */
export const insertAt = (
  ids: readonly string[],
  id: string,
  position: number,
): string[] => {
  const rest = ids.filter((other) => other !== id);
  const at = Math.max(0, Math.min(Math.trunc(position), rest.length));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
};

/**
 * Which one entry a reorder moved, from the touched bands before and after:
 *
 * - exactly one id changed band → that one (a band change);
 * - none changed band → in the one band whose order changed, the id whose
 *   removal makes before and after equal (a single drag within a band; on a
 *   swap of neighbours either qualifies, and the one that travelled further
 *   — then the one that moved up — is taken);
 * - anything else (several ids, several bands) → `null`.
 */
export const movedEntry = (
  before: BandOrders,
  after: BandOrders,
): { id: string; fromBand: number; toBand: number } | null => {
  const bandOf = (orders: BandOrders) => {
    const map = new Map<string, number>();
    for (const [band, ids] of Object.entries(orders)) {
      for (const id of ids) map.set(id, Number(band));
    }
    return map;
  };
  const was = bandOf(before);
  const now = bandOf(after);
  const crossed = [...now].filter(
    ([id, band]) => was.has(id) && was.get(id) !== band,
  );
  if (crossed.length === 1) {
    const [id, toBand] = crossed[0] ?? ["", 0];
    return { id, fromBand: was.get(id) ?? toBand, toBand };
  }
  if (crossed.length > 1) return null;

  const changed = Object.keys(after).filter(
    (band) => !sameOrder(before[band] ?? [], after[band] ?? []),
  );
  if (changed.length !== 1) return null;
  const band = changed[0] ?? "";
  const a = before[band] ?? [];
  const b = after[band] ?? [];
  const candidates = a.filter((id) =>
    sameOrder(
      a.filter((other) => other !== id),
      b.filter((other) => other !== id),
    ),
  );
  if (candidates.length === 0) return null;
  const travel = (id: string) => b.indexOf(id) - a.indexOf(id);
  const [best] = [...candidates].sort(
    (x, y) =>
      Math.abs(travel(y)) - Math.abs(travel(x)) || travel(x) - travel(y),
  );
  if (best === undefined) return null;
  return { id: best, fromBand: Number(band), toBand: Number(band) };
};
