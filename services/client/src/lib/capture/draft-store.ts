/**
 * Label reads that outlive the page that started them — X05's "background
 * continuation after about 8 s".
 *
 * `startItemOnboarding` holds the request open while the model reads (§8.5),
 * and on a local model that can be most of a minute. The person should not
 * have to watch it: after {@link BACKGROUND_AFTER_MS} the progress screen
 * offers "Keep going in the background", and leaving must not throw the read
 * away. So the read's promise lives here, in a module the router does not
 * unmount, keyed by the onboarding id it was minted under:
 *
 * - the wizard's analyze step **tracks** its read here (and adopts a read
 *   already tracked under the same id rather than asking again);
 * - **background** marks one as left: when it settles, the callback runs
 *   (the page raises a "your draft is ready · Review" toast), at once if it
 *   already has;
 * - coming back to `?draft=<id>` **adopts** the tracked promise, so the
 *   draft card opens on the answer that arrived while the person was away.
 *
 * A full reload loses this memory, and that is fine: the onboarding row is
 * the durable copy (`startItemOnboarding` is idempotent per id, so asking
 * again returns the stored answer without another model call).
 *
 * Plain module, no React — `draft-store.test.ts`.
 */

/** When the progress screen offers to carry on without you. */
export const BACKGROUND_AFTER_MS = 8000;

/** How long a settled draft is kept after nobody came back for it. */
export const DRAFT_TTL_MS = 30 * 60 * 1000;

export type DraftMeta = {
  /** For the toast: "Your wine draft is ready". */
  readonly label: string;
  /** Where "Review" goes: the add route with `?draft=<id>`. */
  readonly resumeHref: string;
  /** The front-label capture, kept so the resumed draft still has its photo. */
  readonly photo?: string;
};

type Settled<T> =
  | { readonly state: "reading" }
  | { readonly state: "ready"; readonly value: T }
  | { readonly state: "failed"; readonly error: unknown };

type Entry<T> = {
  readonly id: string;
  readonly meta: DraftMeta;
  readonly promise: Promise<T>;
  settled: Settled<T>;
  settledAt: number | null;
  onSettled: ((entry: DraftView<T>) => void) | null;
};

/** What a caller may read about a tracked draft. */
export type DraftView<T> = {
  readonly id: string;
  readonly meta: DraftMeta;
  readonly promise: Promise<T>;
  readonly settled: Settled<T>;
};

export type DraftStore<T> = {
  /**
   * Track `start()`'s read under `id`, or return the one already tracked —
   * so a remount or a resume never asks the model twice. A read that failed
   * is replaced, so a retry really retries.
   */
  track(id: string, meta: DraftMeta, start: () => Promise<T>): Promise<T>;
  get(id: string): DraftView<T> | null;
  /**
   * The person left the read running. `onSettled` runs once, when it
   * settles (now, if it already has).
   */
  background(id: string, onSettled: (draft: DraftView<T>) => void): boolean;
  /** They came back (or saved): no toast, and the memory can go. */
  release(id: string): void;
};

const view = <T>(entry: Entry<T>): DraftView<T> => ({
  id: entry.id,
  meta: entry.meta,
  promise: entry.promise,
  settled: entry.settled,
});

export const createDraftStore = <T>(
  now: () => number = Date.now,
): DraftStore<T> => {
  const entries = new Map<string, Entry<T>>();

  const prune = () => {
    const cutoff = now() - DRAFT_TTL_MS;
    for (const [id, entry] of Array.from(entries)) {
      if (entry.settledAt !== null && entry.settledAt < cutoff) {
        entries.delete(id);
      }
    }
  };

  const settle = (entry: Entry<T>, settled: Settled<T>) => {
    entry.settled = settled;
    entry.settledAt = now();
    const callback = entry.onSettled;
    entry.onSettled = null;
    callback?.(view(entry));
  };

  return {
    track(id, meta, start) {
      prune();
      const existing = entries.get(id);
      // A failed read is not adopted: a retry is a new attempt (and the
      // session id makes it cost no second model call if the first one in
      // fact landed).
      if (existing !== undefined && existing.settled.state !== "failed") {
        return existing.promise;
      }
      const promise = start();
      const entry: Entry<T> = {
        id,
        meta,
        promise,
        settled: { state: "reading" },
        settledAt: null,
        onSettled: null,
      };
      entries.set(id, entry);
      promise.then(
        (value) => settle(entry, { state: "ready", value }),
        (error: unknown) => settle(entry, { state: "failed", error }),
      );
      return promise;
    },
    get(id) {
      const entry = entries.get(id);
      return entry === undefined ? null : view(entry);
    },
    background(id, onSettled) {
      const entry = entries.get(id);
      if (entry === undefined) return false;
      if (entry.settled.state === "reading") {
        entry.onSettled = onSettled;
      } else {
        onSettled(view(entry));
      }
      return true;
    },
    release(id) {
      entries.delete(id);
    },
  };
};
