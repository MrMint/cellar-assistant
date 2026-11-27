"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AI } from "@/components/app/icons";
import { captureDrafts } from "@/components/capture/drafts";
import { aiJobStore, kickAiJobs } from "@/components/home/ai-job-store";
import type { AiJob } from "@/components/home/ai-jobs";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { BackgroundSheet } from "./BackgroundSheet";
import { backgroundJobs, pillLine } from "./jobs";

export type BackgroundPillProps = {
  className?: string;
};

const NO_JOBS = () => null;

/** A label read's photo, kept by K1's in-memory store while it reads. */
const photoOf = (job: AiJob): string | undefined =>
  job.kind === "LABEL_READ"
    ? captureDrafts.get(job.subjectId)?.meta.photo
    : undefined;

/**
 * The viewfinder's "n in the background" pill (Capture-Place 16 to 20): label
 * reads and menu scans still going, ready or failed, counted in words
 * ("2 reading · 1 ready"), on a glass disc over the camera. Tapping it opens
 * the "In the background" sheet. Nothing to count, nothing drawn.
 *
 * K1 mounts it in the viewfinder (L50) and places it with `className`. The
 * jobs are `me.aiJobs` from the shell's watcher; mounting kicks one poll so
 * a read the camera just left running shows at once.
 */
export function BackgroundPill({ className }: BackgroundPillProps) {
  const all = useSyncExternalStore(
    aiJobStore.subscribe,
    aiJobStore.getSnapshot,
    NO_JOBS,
  );
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    kickAiJobs();
  }, []);
  // A settled job ages out of the pill after its half hour.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const jobs = useMemo(
    () => backgroundJobs(all, dismissed, now),
    [all, dismissed, now],
  );
  const line = pillLine(jobs);
  if (line === null && !open) return null;

  return (
    <>
      {line !== null && (
        <button
          type="button"
          data-slot="background-pill"
          aria-haspopup="dialog"
          aria-label={`In the background: ${line}`}
          onClick={() => {
            feedback("press");
            setOpen(true);
          }}
          className={cn(
            "t-cap tabular inline-flex h-11 items-center gap-2 rounded-md bg-glass px-4 text-on-glass backdrop-blur-md transition-transform active:scale-97 motion-reduce:active:scale-100",
            className,
          )}
        >
          <AI aria-hidden className="size-4 shrink-0" />
          <span className="truncate">{line}</span>
        </button>
      )}
      <BackgroundSheet
        open={open && jobs.length > 0}
        onOpenChange={setOpen}
        jobs={jobs}
        photoOf={photoOf}
        onDismiss={(job) => {
          feedback("tick");
          setDismissed((current) => new Set([...Array.from(current), job.id]));
        }}
      />
    </>
  );
}
