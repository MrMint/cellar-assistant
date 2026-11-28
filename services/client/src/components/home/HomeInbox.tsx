"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
  Scan,
  Schedule,
  Warning,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { notify } from "@/components/app/notify";
import { UserAvatar } from "@/components/app/UserAvatar";
import { AcceptFriendRequestMutation } from "@/components/friend/fragments";
import { Button } from "@/components/ui/button";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
import { tween } from "@/lib/motion";
import { subscribeToConnectivity } from "@/lib/pwa/connectivity";
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
import { SEE_ALL_CLASS, SectionHead } from "./HomeLayout";
import {
  type AiQuotaRow,
  buildInbox,
  type InboxItem,
  type IncomingRequest,
  limitResetLine,
  type PendingSuggestion,
  seenKeyOf,
  type ToCheck,
} from "./inbox";
import { PressLink } from "./PressLink";
import { seenHash, withSeen, writeSeenCookie } from "./seen-cookie";

const KIND_ICON: Readonly<Record<AiJob["kind"], AppIcon>> = {
  LABEL_READ: Camera,
  MENU_SCAN: Scan,
  RECIPE_PHOTO: Recipe,
  TIER_LIST_INSIGHTS: Ranked,
};

/** Rows a section shows before "See all" / "n more" (Shell-Home: max 3). */
export const INBOX_ROWS = 3;

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

/** False while the browser says it is offline; true on the server. */
const useOnline = (): boolean =>
  useSyncExternalStore(
    (onChange) => subscribeToConnectivity(window, onChange),
    () => navigator.onLine,
    () => true,
  );

/**
 * Home's AI tray and "Waiting on you" (Shell-Home).
 *
 * The page renders both from one server read (`HomeInboxQuery`); this keeps
 * them live: it hands the jobs to the app's job store and, when something is
 * still running, wakes the shell's `AiJobWatcher`, whose polls then flow back
 * in here and whose toasts announce what finishes. Answering a row — a friend
 * request accepted, a result opened or dismissed — takes it off the list at
 * once (`seen-cookie.ts` remembers the opened and dismissed ones).
 *
 * The tray has no header: failures first, then what is reading, three rows
 * and "n more". Waiting on you shows three rows and "See all" (the rest in
 * place); from `md` its rows sit two to a line.
 */
export function HomeInbox({
  initialJobs,
  suggestions,
  requests,
  needsDetails = 0,
  toCheck = null,
  quotas = [],
  initialSeen,
}: {
  initialJobs: readonly AiJob[];
  suggestions: readonly PendingSuggestion[];
  requests: readonly IncomingRequest[];
  /** The viewer's saved drafts (`needsDetailsCount`, MC-drafts). */
  needsDetails?: number;
  toCheck?: ToCheck | null;
  /** `myAiQuota`, so "Limit reached" can name the reset (MC-quota). */
  quotas?: readonly AiQuotaRow[];
  /** The seen cookie as the server read it, so both renders agree. */
  initialSeen: readonly string[];
}) {
  const router = useRouter();
  const jobs = useJobs(initialJobs);
  const [seen, setSeen] = useState<readonly string[]>(initialSeen);
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set());
  const [allWaiting, setAllWaiting] = useState(false);

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
        needsDetails,
        toCheck,
        seen: seenSet,
      }),
    [jobs, suggestions, requests, answered, needsDetails, toCheck, seenSet],
  );
  const tray = trayJobs(jobs, seenSet);

  const [, acceptRequest] = useMutation(AcceptFriendRequestMutation);
  // F-124: the row stays tappable through its 160 ms exit, so a second tap
  // must not send a second accept (whose NotFound would read as a failure).
  const accepting = useRef<Set<string>>(new Set());
  const accept = async (requestId: string, name: string) => {
    if (accepting.current.has(requestId)) return;
    accepting.current.add(requestId);
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
      // Answered stays held on success: the row is leaving for good.
      accepting.current.delete(requestId);
      setAnswered((current) => {
        const next = new Set(current);
        next.delete(requestId);
        return next;
      });
      feedback("refuse");
      notify("That request wasn't accepted", {
        description: "Try again from Friends.",
        tone: "error",
      });
      return;
    }
    feedback("success");
    // CROSS-LOT "Friend accepted toast": Shell-Home's words.
    notify(`${name} is your friend`, { tone: "success" });
    router.refresh();
  };

  const shown = allWaiting ? items : items.slice(0, INBOX_ROWS);

  return (
    <>
      <AiJobTray
        jobs={tray}
        quotas={quotas}
        onDismiss={(job) => markSeen(seenKeyOf(job))}
      />
      {/* Where `/discoveries` and `/map/scans` now land (D1). */}
      <div id="waiting" className="-mb-8 scroll-mt-4" />
      {items.length > 0 && (
        <section
          aria-labelledby="waiting-heading"
          className="flex flex-col gap-2"
        >
          <SectionHead
            id="waiting-heading"
            title="Waiting on you"
            count={items.length}
            action={
              items.length > INBOX_ROWS ? (
                <button
                  type="button"
                  aria-expanded={allWaiting}
                  onClick={() => {
                    feedback("tick");
                    setAllWaiting((open) => !open);
                  }}
                  className={SEE_ALL_CLASS}
                >
                  {allWaiting ? "Show fewer" : "See all"}
                </button>
              ) : undefined
            }
          />
          <ul
            aria-label="Waiting on you"
            className="m-0 grid list-none grid-cols-1 gap-px overflow-hidden rounded-md border border-edge bg-rule p-0 md:grid-cols-2"
          >
            <AnimatePresence initial={false}>
              {shown.map((item) => (
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
                        ? () =>
                            void accept(item.requestId, item.user.displayName)
                        : undefined
                    }
                  />
                </Collapse>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      )}
    </>
  );
}

/** The tray's jobs: failures nobody dismissed first, then what is reading. */
export const trayJobs = (
  jobs: readonly AiJob[],
  seen: ReadonlySet<string>,
): AiJob[] => [
  ...jobs.filter(
    (job) => job.status === "FAILED" && !seen.has(seenHash(seenKeyOf(job))),
  ),
  ...jobs.filter((job) => job.status === "RUNNING"),
];

/** A row leaving the list collapses (design §4.7: removals, 160 ms). */
function Collapse({ children }: { children: ReactNode }) {
  return (
    <motion.li
      layout="position"
      initial={false}
      exit={{ opacity: 0, height: 0 }}
      transition={tween("short")}
      className="overflow-hidden bg-card"
    >
      {children}
    </motion.li>
  );
}

const Chevron = () => (
  <ChevronRight
    aria-hidden
    strokeWidth={ICON_STROKE}
    className="size-5 shrink-0 text-ink-3"
  />
);

/** A glyph on a 40 raised tile, the inbox's and the tray's leading slot. */
function Tile({
  icon: Icon,
  tone = "glyph",
  breathe = false,
}: {
  icon: AppIcon;
  tone?: "glyph" | "warn" | "danger";
  breathe?: boolean;
}) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-raised">
      <Icon
        aria-hidden
        strokeWidth={ICON_STROKE}
        className={cn(
          "size-5",
          tone === "glyph" && "text-glyph",
          tone === "warn" && "text-ink-2",
          tone === "danger" && "text-danger",
          breathe && "motion-safe:animate-pulse",
        )}
      />
    </span>
  );
}

/** One row's frame: tile, two lines, a trailing slot. 64 minimum. */
function Row({
  leading,
  title,
  detail,
  trailing,
  extra,
}: {
  leading: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-16 items-center gap-3 py-2.5 pr-2 pl-3 has-[a[data-slot=link]:active]:bg-raised">
      {leading}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="t-head line-clamp-2 text-ink">{title}</span>
        {detail !== undefined && detail !== null && (
          <span className="t-cap truncate text-ink-2">{detail}</span>
        )}
        {extra}
      </div>
      {trailing !== undefined && (
        <div className="relative z-10 flex shrink-0 items-center gap-1">
          {trailing}
        </div>
      )}
    </div>
  );
}

const bottlesWord = (n: number) => (n === 1 ? "1 bottle" : `${n} bottles`);

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
  switch (item.kind) {
    case "matches":
      return (
        <Row
          leading={<Tile icon={Scan} />}
          title={
            <PressLink href={item.href} overlay className="text-ink">
              {item.count === 1
                ? "1 menu match to confirm"
                : `${item.count} menu matches to confirm`}
            </PressLink>
          }
          detail={`${item.placeName} · ${item.names.join(", ")}`}
          trailing={<Chevron />}
        />
      );
    case "needs-details":
      return (
        <Row
          leading={<Tile icon={Schedule} />}
          title={
            <PressLink href={item.href} overlay className="text-ink">
              Needs details · {bottlesWord(item.count)}
            </PressLink>
          }
          detail="Saved to finish later"
          trailing={<Chevron />}
        />
      );
    case "to-check":
      return (
        <Row
          leading={<Tile icon={Warning} tone="warn" />}
          title={
            <PressLink href={item.check.href} overlay className="text-ink">
              {item.check.count} to check
            </PressLink>
          }
          detail={`${item.check.name} · ${item.check.fields}`}
          trailing={<Chevron />}
        />
      );
    case "request":
      return (
        <Row
          leading={
            <UserAvatar
              avatarUrl={item.user.avatarUrl}
              displayName={item.user.displayName}
              size="md"
            />
          }
          title={
            <PressLink href={item.href} overlay className="text-ink">
              {item.user.displayName} wants to be friends
            </PressLink>
          }
          trailing={
            // CROSS-LOT: actions inside a row are secondary, outlined.
            <Button variant="secondary" onClick={onAccept}>
              Accept
            </Button>
          }
        />
      );
    case "job": {
      const { job } = item;
      return (
        <Row
          leading={<Tile icon={KIND_ICON[job.kind]} />}
          title={
            <PressLink
              href={item.href}
              overlay
              className="text-ink"
              onClick={onOpen}
            >
              {readyLine(job)}
            </PressLink>
          }
          detail={readyDetail(job)}
          trailing={
            <IconButton
              aria-label={`Dismiss: ${readyLine(job)}`}
              onClick={() => {
                feedback("tick");
                onDismiss?.();
              }}
            >
              <Close aria-hidden strokeWidth={ICON_STROKE} />
            </IconButton>
          }
        />
      );
    }
  }
}

/**
 * Running AI work and the failures nobody has dismissed yet, above Waiting
 * on you, in one card with no header (Shell-Home): three rows, then "n more".
 * A running row breathes (no looping bar); offline it says it waits. A limit
 * reads calm, never red, and names its reset (MC-quota).
 */
function AiJobTray({
  jobs,
  quotas,
  onDismiss,
}: {
  jobs: readonly AiJob[];
  quotas: readonly AiQuotaRow[];
  onDismiss: (job: AiJob) => void;
}) {
  const [all, setAll] = useState(false);
  const online = useOnline();
  if (jobs.length === 0) return null;
  const shown = all ? jobs : jobs.slice(0, INBOX_ROWS);
  const more = jobs.length - shown.length;
  return (
    <section
      aria-label="AI work"
      aria-live="polite"
      className="overflow-hidden rounded-md border border-edge bg-card"
    >
      <ul className="m-0 flex list-none flex-col divide-y divide-rule p-0">
        <AnimatePresence initial={false}>
          {shown.map((job) => (
            <Collapse key={job.id}>
              {job.status === "RUNNING" ? (
                <Row
                  leading={<Tile icon={AI} breathe={online} />}
                  title={
                    <>
                      {runningLine(job)}
                      <span className="sr-only"> — in progress</span>
                    </>
                  }
                  detail={online ? "Working on it" : "Waits for a connection"}
                />
              ) : (
                <FailedJob
                  job={job}
                  quotas={quotas}
                  onDismiss={() => onDismiss(job)}
                />
              )}
            </Collapse>
          ))}
        </AnimatePresence>
      </ul>
      {more > 0 && (
        <button
          type="button"
          onClick={() => {
            feedback("tick");
            setAll(true);
          }}
          className="t-head flex min-h-11 w-full items-center justify-center border-rule border-t text-act-ink outline-none focus-visible:outline-2 focus-visible:outline-act-ink focus-visible:-outline-offset-2 active:bg-raised"
        >
          {more} more
        </button>
      )}
    </section>
  );
}

function FailedJob({
  job,
  quotas,
  onDismiss,
}: {
  job: AiJob;
  quotas: readonly AiQuotaRow[];
  onDismiss: () => void;
}) {
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
  const detail =
    outcome.kind === "user-cap" && now !== null
      ? (limitResetLine(job.retryAt, quotas, { now }) ?? outcome.message)
      : outcome.message;
  return (
    <div data-tone={outcome.tone}>
      <Row
        leading={
          <Tile
            icon={limit ? Schedule : Warning}
            tone={outcome.tone === "danger" ? "danger" : "warn"}
          />
        }
        title={failedLine(job)}
        detail={detail}
        trailing={
          <>
            {href !== null && outcome.canRetry && (
              <Button variant="quiet" asChild>
                <Link href={href} underline="none">
                  Try again
                </Link>
              </Button>
            )}
            <IconButton
              aria-label={`Dismiss: ${failedLine(job)}`}
              onClick={() => {
                feedback("tick");
                onDismiss();
              }}
            >
              <Close aria-hidden strokeWidth={ICON_STROKE} />
            </IconButton>
          </>
        }
      />
    </div>
  );
}
