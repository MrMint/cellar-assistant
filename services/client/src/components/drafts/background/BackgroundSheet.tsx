"use client";

import { ChevronRight, Close, Scan } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { TypeGlyph } from "@/components/app/TypeChip";
import type { AiJob } from "@/components/home/ai-jobs";
import { aiJobHref, aiJobOutcome } from "@/components/home/ai-jobs";
import { Button } from "@/components/ui/button";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { jobTitle, readyDetailLine } from "./jobs";

/** A label read's photo, from K1's in-memory store (absent after a reload). */
export type PhotoOf = (job: AiJob) => string | undefined;

function JobThumb({ job, photo }: { job: AiJob; photo: string | undefined }) {
  return (
    <div className="relative flex size-[54px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-raised">
      {photo !== undefined ? (
        // biome-ignore lint/performance/noImgElement: a local capture (blob/data URL)
        <img
          src={photo}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
      ) : job.kind === "LABEL_READ" && job.itemType !== null ? (
        <TypeGlyph type={job.itemType} className="size-6 text-glyph" />
      ) : (
        <Scan aria-hidden className="size-6 text-glyph" strokeWidth={1.25} />
      )}
    </div>
  );
}

function JobRow({
  job,
  photo,
  onDismiss,
}: {
  job: AiJob;
  photo: string | undefined;
  onDismiss: (job: AiJob) => void;
}) {
  const href = aiJobHref(job);
  const title = jobTitle(job);
  if (job.status === "RUNNING") {
    return (
      <li className="flex min-h-14 items-center gap-3 py-2">
        <JobThumb job={job} photo={photo} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="t-head truncate text-ink">{title}</span>
          <span className="t-cap truncate text-ink-2">Working on it</span>
          <span
            role="progressbar"
            aria-label={title}
            className="relative mt-1 h-0.5 overflow-hidden rounded-full bg-hair"
          >
            <span className="absolute inset-y-0 left-1/4 w-2/5 rounded-full bg-ink-2 motion-safe:animate-pulse" />
          </span>
        </div>
      </li>
    );
  }
  if (job.status === "FAILED") {
    const outcome = aiJobOutcome(job);
    return (
      <li className="flex flex-col gap-1 py-2">
        <div className="flex min-h-14 items-center gap-3">
          <JobThumb job={job} photo={photo} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span
              className={cn(
                "t-head truncate",
                outcome.tone === "danger" ? "text-danger" : "text-ink",
              )}
            >
              {title}
            </span>
            <span className="t-cap truncate text-ink-2">{outcome.title}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss"
            onClick={() => onDismiss(job)}
          >
            <Close aria-hidden className="text-ink-2" />
          </Button>
        </div>
        {href !== null && outcome.canRetry && (
          <div className="pl-[66px]">
            <Button variant="quiet" asChild>
              <Link href={href} underline="none">
                Try again
              </Link>
            </Button>
          </div>
        )}
      </li>
    );
  }
  const detail = readyDetailLine(job);
  return (
    <li className="relative">
      <div className="flex min-h-14 items-center gap-3 py-2">
        <JobThumb job={job} photo={photo} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="t-head truncate text-ink">
            {href === null ? (
              title
            ) : (
              <Link
                href={href}
                overlay
                underline="none"
                onClick={() => feedback("press")}
              >
                {title}
              </Link>
            )}
          </span>
          {detail !== null && (
            <span className="t-cap truncate text-ink-2">{detail}</span>
          )}
        </div>
        {href !== null && (
          <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-3" />
        )}
      </div>
    </li>
  );
}

/**
 * "In the background" (Capture-Place 18 to 20): what the camera left
 * running. A failure says why, offers Try again when trying again can work,
 * and can be dismissed; a result opens where it lives; a read in progress
 * shows it is working. Close returns to the camera.
 */
export function BackgroundSheet({
  open,
  onOpenChange,
  jobs,
  photoOf,
  onDismiss,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobs: readonly AiJob[];
  photoOf: PhotoOf;
  onDismiss: (job: AiJob) => void;
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="In the background"
      footer={
        <Button
          variant="quiet-muted"
          className="w-full"
          onClick={() => onOpenChange(false)}
        >
          Close
        </Button>
      }
    >
      <ul
        data-slot="background-jobs"
        className="m-0 flex list-none flex-col divide-y divide-hair p-0 pb-2"
      >
        {jobs.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            photo={photoOf(job)}
            onDismiss={onDismiss}
          />
        ))}
      </ul>
    </ResponsiveDialog>
  );
}
