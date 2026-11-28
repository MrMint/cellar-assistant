/**
 * The app's one view of the viewer's AI work while it runs (X10): the job
 * tray on Home reads it, `AiJobWatcher` (mounted once, in the shell) writes
 * it, and anything that starts AI work **kicks** it so the watcher starts
 * polling — a menu scan, a recipe photo.
 *
 * Module scope, like `captureDrafts`: it outlives the page that started the
 * work, which is the point — the toast lands wherever the person has gone.
 *
 * A kick can arrive before the watcher has subscribed (a child's effect runs
 * before its parent's, so Home's tray kicks before the shell's watcher is
 * listening); it is held until the watcher takes it.
 *
 * Plain module, no React — `ai-jobs.test.ts` ("aiJobStore").
 */
import type { AiJob } from "./ai-jobs";

type Listener = () => void;

export type AiJobStore = {
  /** The latest jobs anyone has read, or null before the first. */
  getSnapshot(): readonly AiJob[] | null;
  subscribe(listener: Listener): () => void;
  /** New jobs from a poll or a page's server read. */
  publish(jobs: readonly AiJob[]): void;
  /** Something started AI work: poll until it settles. */
  kick(): void;
  /**
   * The watcher's side of {@link kick}: `onKick` runs for every kick from
   * now on, and once at once if one arrived before anyone was listening.
   */
  listen(onKick: () => void): () => void;
  /**
   * Forget everything: the jobs and any held kick. The watcher calls it when
   * the signed-in shell goes away (sign-out), so the next person to sign in
   * on this tab never sees — even for a frame — the last one's AI work.
   */
  reset(): void;
};

export const createAiJobStore = (): AiJobStore => {
  let jobs: readonly AiJob[] | null = null;
  const listeners = new Set<Listener>();
  const kickListeners = new Set<() => void>();
  let heldKick = false;

  return {
    getSnapshot: () => jobs,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish(next) {
      jobs = next;
      for (const listener of Array.from(listeners)) listener();
    },
    kick() {
      if (kickListeners.size === 0) {
        heldKick = true;
        return;
      }
      for (const onKick of Array.from(kickListeners)) onKick();
    },
    listen(onKick) {
      kickListeners.add(onKick);
      if (heldKick) {
        heldKick = false;
        onKick();
      }
      return () => {
        kickListeners.delete(onKick);
      };
    },
    reset() {
      heldKick = false;
      jobs = null;
      for (const listener of Array.from(listeners)) listener();
    },
  };
};

/** The app's store. */
export const aiJobStore = createAiJobStore();

/** For a page that just started AI work: the watcher takes it from here. */
export const kickAiJobs = (): void => aiJobStore.kick();
