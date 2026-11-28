"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useClient } from "urql";
import { notify } from "@/components/app/notify";
import { useNavigate } from "@/components/app/useNavigate";
import { readFragment } from "@/lib/api/graphql";
import { aiJobStore } from "./ai-job-store";
import {
  type AiJob,
  anyRunning,
  isWatchedAt,
  type JobSnapshot,
  settledSince,
  snapshotOf,
  toastFor,
} from "./ai-jobs";
import { AiJobFieldsFragment, AiJobsQuery } from "./queries";

/** Between polls while something runs. */
export const POLL_MS = 4000;
/** A watch that has run this long without everything settling gives up. */
export const WATCH_LIMIT_MS = 15 * 60 * 1000;

/**
 * The AI job tray's engine (X10), mounted once in the signed-in shell.
 *
 * It does nothing until something **kicks** it (`kickAiJobs`): Home with work
 * still running, a menu scan or a recipe photo just started. Then it polls
 * `me.aiJobs` every {@link POLL_MS} — skipping ticks while the tab is hidden —
 * until nothing runs, publishes each answer to the job store (Home's tray
 * reads it), and toasts each job it saw running that has now settled: the
 * menu is read, the recipe is ready, or N07's words for why not. The toast
 * carries the way there ("Open", "Review", "Try again").
 *
 * Quiet where the screen already says it (`isWatchedAt`): no toast for a
 * label read (the add flow, which knows whether the person left it running,
 * says that itself), and none on the job's own page or the screen that
 * started it and is watching it finish. When anything settles while Home
 * is showing, Home refreshes so its sections agree with the tray.
 */
export function AiJobWatcher() {
  const client = useClient();
  const router = useRouter();
  const navigate = useNavigate();
  const pathname = usePathname() ?? "/";
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let startedAt = 0;
    let before: JobSnapshot | null = null;

    const stop = () => {
      running = false;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };

    const tick = async () => {
      timer = null;
      if (!running) return;
      if (Date.now() - startedAt > WATCH_LIMIT_MS) return stop();
      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(tick, POLL_MS);
        return;
      }
      const response = await client
        .query(AiJobsQuery, {}, { requestPolicy: "network-only" })
        .toPromise()
        .catch(() => null);
      if (!running) return;
      const nodes = response?.data?.me?.aiJobs.edges ?? null;
      if (nodes === null) {
        timer = setTimeout(tick, POLL_MS);
        return;
      }
      const jobs: AiJob[] = nodes.map((edge) =>
        readFragment(AiJobFieldsFragment, edge.node),
      );
      const previous = before ?? snapshotOf(aiJobStore.getSnapshot() ?? []);
      const settled = settledSince(previous, jobs);
      before = snapshotOf(jobs);
      aiJobStore.publish(jobs);
      for (const job of settled) announce(job, pathRef.current, navigate.push);
      if (settled.length > 0 && pathRef.current === "/") router.refresh();
      if (anyRunning(jobs)) timer = setTimeout(tick, POLL_MS);
      else stop();
    };

    const start = () => {
      startedAt = Date.now();
      if (running) return;
      running = true;
      before = null;
      void tick();
    };

    const unlisten = aiJobStore.listen(start);
    return () => {
      unlisten();
      stop();
      // The shell is going (sign-out): this viewer's jobs go with it.
      aiJobStore.reset();
    };
  }, [client, navigate, router]);

  return null;
}

/** The finish toast, unless the person is already where it would send them. */
function announce(
  job: AiJob,
  pathname: string,
  navigate: (href: string) => void,
): void {
  if (isWatchedAt(job, pathname)) return;
  const toast = toastFor(job);
  if (toast === null) return;
  notify(toast.message, {
    ...(toast.description === null ? {} : { description: toast.description }),
    ...(toast.tone === undefined ? {} : { tone: toast.tone }),
    ...(toast.href === null
      ? {}
      : {
          undo: () => {
            if (toast.href !== null) navigate(toast.href);
          },
          actionLabel: toast.actionLabel,
        }),
    id: `ai-job:${job.id}`,
    durationMs: 10_000,
  });
}
