"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useMutation } from "urql";
import { IconButton } from "@/components/app/IconButton";
import {
  AI,
  type AppIcon,
  Camera,
  ChevronRight,
  Close,
  ICON_STROKE,
  Ranked,
  Recipe,
  Restaurant,
  Scan,
  Schedule,
  Warning,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { notify } from "@/components/app/notify";
import { InsetSection, ListRow } from "@/components/app/Page";
import { UserAvatar } from "@/components/app/UserAvatar";
import { AcceptFriendRequestMutation } from "@/components/friend/fragments";
import { Button } from "@/components/ui/button";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";
import { tween } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { aiJobStore, kickAiJobs } from "./ai-job-store";
import {
  type AiJob,
  aiJobHref,
  aiJobOutcome,
  anyRunning,
  failedLine,
  readyDetail,
  readyLine,
  runningLine,
} from "./ai-jobs";
import {
  buildInbox,
  type InboxItem,
  type IncomingRequest,
  type PendingSuggestion,
  seenKeyOf,
} from "./inbox";
import { seenHash, withSeen, writeSeenCookie } from "./seen-cookie";

const KIND_ICON: Readonly<Record<AiJob["kind"], AppIcon>> = {
  LABEL_READ: Camera,
  MENU_SCAN: Scan,
  RECIPE_PHOTO: Recipe,
  TIER_LIST_INSIGHTS: Ranked,
};

/**
 * The latest jobs: this page's read first, then whatever is published after
 * it — the page's own read (below), then the watcher's polls. Never what the
 * store held before this page arrived: on a client navigation back to Home
 * that would draw an older answer (or, after a sign-out and sign-in on one
 * tab, someone else's) until the page's read was published over it.
 */
const useJobs = (initial: readonly AiJob[]): readonly AiJob[] => {
  const [jobs, setJobs] = useState(initial);
  useEffect(
    () =>
      aiJobStore.subscribe(() => {
        const next = aiJobStore.getSnapshot();
        if (next !== null) setJobs(next);
      }),
    [],
  );
  return jobs;
};

/**
 * Home's AI job tray and "Waiting on you" (X10).
 *
 * The page renders both from one server read (`HomeInboxQuery`); this keeps
 * them live: it hands the jobs to the app's job store and, when something is
 * still running, wakes the shell's `AiJobWatcher`, whose polls then flow back
 * in here and whose toasts announce what finishes. Answering a row — a friend
 * request accepted, a result opened or dismissed — takes it off the list at
 * once (`seen-cookie.ts` remembers the opened and dismissed ones).
 */
export function HomeInbox({
  initialJobs,
  suggestions,
  requests,
  initialSeen,
}: {
  initialJobs: readonly AiJob[];
  suggestions: readonly PendingSuggestion[];
  requests: readonly IncomingRequest[];
  /** The seen cookie as the server read it, so both renders agree. */
  initialSeen: readonly string[];
}) {
  const router = useRouter();
  const jobs = useJobs(initialJobs);
  const [seen, setSeen] = useState<readonly string[]>(initialSeen);
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set());

  // This page's read is the freshest the app has; anything running wakes the
  // watcher, which keeps the store (and so this list) current.
  useEffect(() => {
    aiJobStore.publish(initialJobs);
    if (anyRunning(initialJobs)) kickAiJobs();
  }, [initialJobs]);

  const markSeen = (key: string) => {
    setSeen((current) => {
      const next = withSeen(current, key);
      writeSeenCookie(next);
      return next;
    });
  };

  const seenSet = useMemo(() => new Set(seen), [seen]);
  const items = useMemo(
    () =>
      buildInbox({
        jobs,
        suggestions,
        requests: requests.filter((request) => !answered.has(request.id)),
        seen: seenSet,
      }),
    [jobs, suggestions, requests, answered, seenSet],
  );
  const tray = jobs.filter(
    (job) =>
      job.status === "RUNNING" ||
      (job.status === "FAILED" && !seenSet.has(seenHash(seenKeyOf(job)))),
  );

  const [, acceptRequest] = useMutation(AcceptFriendRequestMutation);
  const accept = async (requestId: string, name: string) => {
    setAnswered((current) => new Set(current).add(requestId));
    const response = await acceptRequest({ requestId });
    const failure = response.error
      ? failureFromTransport(response.error)
      : (() => {
          const result = unwrapResult(
            response.data?.acceptFriendRequest,
            "AcceptFriendRequestPayload",
          );
          return result.ok ? null : result.error;
        })();
    if (failure !== null) {
      setAnswered((current) => {
        const next = new Set(current);
        next.delete(requestId);
        return next;
      });
      notify("That request couldn't be accepted", {
        description: "Try again from Friends.",
        tone: "error",
      });
      return;
    }
    notify(`You and ${name} are friends`, { tone: "success" });
    router.refresh();
  };

  return (
    <>
      <AiJobTray jobs={tray} onDismiss={(job) => markSeen(seenKeyOf(job))} />
      {/* Where `/discoveries` and `/map/scans` now land (D1). */}
      <div id="waiting" className="-mb-6 scroll-mt-4" />
      {items.length > 0 && (
        <InsetSection label="Waiting on you" aria-label="Waiting on you">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <Collapse key={item.id}>
                <InboxRow
                  item={item}
                  onOpen={() => {
                    if (item.kind === "job") markSeen(item.seenKey);
                  }}
                  onDismiss={
                    item.kind === "job"
                      ? () => markSeen(item.seenKey)
                      : undefined
                  }
                  onAccept={
                    item.kind === "request"
                      ? () => void accept(item.requestId, item.user.displayName)
                      : undefined
                  }
                />
              </Collapse>
            ))}
          </AnimatePresence>
        </InsetSection>
      )}
    </>
  );
}

/** A row leaving the list collapses (design §4.7: removals, 160 ms). */
function Collapse({ children }: { children: ReactNode }) {
  return (
    <motion.div
      layout="position"
      initial={false}
      exit={{ opacity: 0, height: 0 }}
      transition={tween("short")}
      className="overflow-hidden"
    >
      {children}
    </motion.div>
  );
}

const Chevron = () => (
  <ChevronRight aria-hidden strokeWidth={ICON_STROKE} className="size-5" />
);

/** A glyph in a 36 pt tile, the inbox's leading slot. */
function Tile({ icon: Icon, ai = false }: { icon: AppIcon; ai?: boolean }) {
  return (
    <span className="flex size-9 items-center justify-center rounded-md bg-surface-2">
      <Icon
        aria-hidden
        strokeWidth={ICON_STROKE}
        className={cn("size-5", ai ? "text-ai" : "text-ink-2")}
      />
    </span>
  );
}

function InboxRow({
  item,
  onOpen,
  onDismiss,
  onAccept,
}: {
  item: InboxItem;
  onOpen: () => void;
  onDismiss?: () => void;
  onAccept?: () => void;
}) {
  if (item.kind === "matches") {
    return (
      <ListRow
        leading={<Tile icon={Restaurant} ai />}
        title={
          <Link
            href={item.href}
            overlay
            underline="none"
            className="text-ink-1"
          >
            {item.count === 1
              ? "1 menu match to confirm"
              : `${item.count} menu matches to confirm`}
          </Link>
        }
        description={`${item.placeName} · ${item.names.join(", ")}`}
        trailing={<Chevron />}
      />
    );
  }
  if (item.kind === "request") {
    return (
      <ListRow
        leading={
          <UserAvatar
            avatarUrl={item.user.avatarUrl}
            displayName={item.user.displayName}
            size="sm"
          />
        }
        title={
          <Link
            href={item.href}
            overlay
            underline="none"
            className="text-ink-1"
          >
            {item.user.displayName} wants to be friends
          </Link>
        }
        description="Friends see what you rate and rank"
        trailing={
          <Button size="sm" onClick={onAccept}>
            Accept
          </Button>
        }
      />
    );
  }
  const { job } = item;
  return (
    <ListRow
      leading={<Tile icon={KIND_ICON[job.kind]} ai />}
      title={
        <Link
          href={item.href}
          overlay
          underline="none"
          className="text-ink-1"
          onClick={onOpen}
        >
          {readyLine(job)}
        </Link>
      }
      description={readyDetail(job) ?? undefined}
      trailing={
        <IconButton
          aria-label={`Dismiss: ${readyLine(job)}`}
          size="sm"
          onClick={onDismiss}
        >
          <Close aria-hidden strokeWidth={ICON_STROKE} />
        </IconButton>
      }
    />
  );
}

/**
 * Running AI work and the failures nobody has dismissed yet, above the inbox.
 * Teal is the AI's colour (design §3.2) and is used only here and on the
 * inbox's AI tiles. A limit reads calm, never red (N07).
 */
function AiJobTray({
  jobs,
  onDismiss,
}: {
  jobs: readonly AiJob[];
  onDismiss: (job: AiJob) => void;
}) {
  if (jobs.length === 0) return null;
  return (
    <section
      aria-label="AI work"
      aria-live="polite"
      className="flex flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {jobs.map((job) => (
          <Collapse key={job.id}>
            {job.status === "RUNNING" ? (
              <div className="flex min-h-11 items-center gap-3 rounded-lg bg-surface-1 px-4 py-2.5">
                <AI
                  aria-hidden
                  strokeWidth={ICON_STROKE}
                  className="size-5 shrink-0 text-ai motion-safe:animate-pulse"
                />
                <p className="type-callout min-w-0 flex-1 truncate text-ink-1">
                  {runningLine(job)}
                  <span className="sr-only"> — in progress</span>
                </p>
              </div>
            ) : (
              <FailedJob job={job} onDismiss={() => onDismiss(job)} />
            )}
          </Collapse>
        ))}
      </AnimatePresence>
    </section>
  );
}

function FailedJob({ job, onDismiss }: { job: AiJob; onDismiss: () => void }) {
  // `retryAt` is phrased in the viewer's own zone, so only after mount.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const outcome = aiJobOutcome(
    now === null ? { ...job, retryAt: null } : job,
    now === null ? {} : { now },
  );
  const href = aiJobHref(job);
  const limit =
    outcome.kind === "user-cap" || outcome.kind === "service-budget";
  const Icon = limit ? Schedule : Warning;
  return (
    <div
      data-tone={outcome.tone}
      className={cn(
        "flex items-start gap-3 rounded-lg bg-surface-1 py-2.5 pr-1 pl-4",
        outcome.tone === "danger" && "ring-1 ring-destructive/60",
      )}
    >
      <Icon
        aria-hidden
        strokeWidth={ICON_STROKE}
        className={cn(
          "mt-0.5 size-5 shrink-0",
          outcome.tone === "danger" ? "text-destructive" : "text-ink-2",
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="type-callout font-semibold text-ink-1">
          {failedLine(job)}
        </p>
        <p className="type-footnote text-ink-2">{outcome.message}</p>
        {href !== null && (
          <Link
            href={href}
            className="type-callout mt-1 self-start text-ink-1"
            underline="always"
          >
            {outcome.canRetry ? "Try again" : "Open"}
          </Link>
        )}
      </div>
      <IconButton
        aria-label={`Dismiss: ${failedLine(job)}`}
        size="sm"
        onClick={onDismiss}
      >
        <Close aria-hidden strokeWidth={ICON_STROKE} />
      </IconButton>
    </div>
  );
}
