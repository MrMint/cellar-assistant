"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useClient, useMutation, useQuery } from "urql";
import { AppBar } from "@/components/app/AppBar";
import {
  AI,
  Camera,
  ChevronRight,
  ICON_STROKE,
  Paste,
  Write,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { Page } from "@/components/app/Page";
import { useNavigate } from "@/components/app/useNavigate";
import { AiStatus } from "@/components/common/AiStatus";
import { kickAiJobs } from "@/components/home/ai-job-store";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { isOffered, useAiCapabilities } from "@/lib/ai/capabilities";
import { aiOutcome } from "@/lib/ai/outcome";
import {
  describeUploadBlockers,
  UploadRejectedError,
  UploadUnavailableError,
  uploadFile,
} from "@/lib/api/files";
import {
  CancelRecipePhotoJobMutation,
  RECIPE_PHOTO_STAGE_LABEL,
  StartRecipePhotoJobMutation,
} from "@/lib/api/recipe-photos";
import { unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import { stageProgress } from "../adapter";
import { RecipeLeftoverQuery, StartRecipeTextJobMutation } from "./documents";
import { takeRecipePhoto } from "./pending-photo";
import { RecipeEditor } from "./RecipeEditor";
import { blankForm } from "./recipe-draft";
import { useRecipeJob } from "./useRecipeJob";

export type ComposerSource = "photo" | "paste" | "type" | null;

/** The longest paste the server reads (`RECIPE_TEXT_MAX`). */
const PASTE_MAX = 8000;

/** What a failed read says, in words — never the server's sentence alone. */
export const readFailureCopy = (
  reason: string,
  source: "photo" | "paste",
  /** The job wrote a partial draft before it failed (`RecipeLeftoverQuery`). */
  leftDraft = false,
): { kind: "nothing-read" | "retryable"; title: string; message: string } => {
  if (leftDraft) {
    return {
      kind: "retryable",
      title: "Reading stopped part-way",
      message:
        "What it read so far is a draft only you can see. Review it, or start again.",
    };
  }
  if (/no recipe could be read/i.test(reason)) {
    return source === "photo"
      ? {
          kind: "nothing-read",
          title: "No recipe in that photo",
          message:
            "Nothing was saved. Try a sharper photo of the ingredients and method, or type it in.",
        }
      : {
          kind: "nothing-read",
          title: "No recipe in that text",
          message:
            "Nothing was saved. Paste the ingredients and the method, or type it in.",
        };
  }
  return {
    kind: "retryable",
    title: "Couldn't read it",
    message: `Nothing was saved. ${reason}`,
  };
};

/**
 * `/recipes/new` (X15): Photo · Paste · Type, then — for the two the AI reads —
 * the reading, then the draft editor.
 *
 * Photo starts on its own: the New recipe sheet hands the chosen photo over
 * (`pending-photo.ts`) and reading begins as the page opens; a cold visit
 * asks for a photo once and starts the moment one is chosen. There is no
 * second "Extract" button anywhere. The result is a private draft, and the
 * page replaces itself with that draft's editor (`/recipes/<id>/edit`).
 */
export function RecipeComposer({ source }: { source: ComposerSource }) {
  const aiOffered = isOffered(useAiCapabilities(), "recipePhoto");
  if (source === "type")
    return <RecipeEditor mode="new" initial={blankForm()} />;
  if (source === "photo" && aiOffered) return <PhotoComposer />;
  if (source === "paste" && aiOffered) return <PasteComposer />;
  return <ComposerChoices aiOffered={aiOffered} />;
}

/** The three ways in, as a page (the ＋ chooser and a cold `/recipes/new`). */
function ComposerChoices({ aiOffered }: { aiOffered: boolean }) {
  const choices = [
    ...(aiOffered
      ? [
          {
            href: "/recipes/new?from=photo",
            icon: Camera,
            title: "Photo",
            line: "A recipe card, a book page or a screenshot",
          },
          {
            href: "/recipes/new?from=paste",
            icon: Paste,
            title: "Paste",
            line: "Text from a website or a message",
          },
        ]
      : []),
    {
      href: "/recipes/new?from=type",
      icon: Write,
      title: "Type",
      line: "Write it in yourself",
    },
  ];
  return (
    <Page>
      <AppBar title="New recipe" parent="/recipes" />
      <ul className="flex flex-col divide-y divide-rule overflow-hidden rounded-lg border border-edge bg-card">
        {choices.map(({ href, icon: Icon, title, line }) => (
          <li key={href} className="relative">
            <div className="flex min-h-14 items-center gap-3 px-4 py-3 active:bg-raised">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-raised text-ink">
                <Icon
                  aria-hidden
                  className="size-5"
                  strokeWidth={ICON_STROKE}
                />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <Link
                  href={href}
                  overlay
                  underline="none"
                  className="t-head text-ink"
                >
                  {title}
                </Link>
                <span className="t-cap text-ink-3">{line}</span>
              </span>
              <ChevronRight
                aria-hidden
                className="size-5 text-ink-3"
                strokeWidth={ICON_STROKE}
              />
            </div>
          </li>
        ))}
      </ul>
      {!aiOffered && (
        <p className="px-1 t-cap text-ink-3">
          Reading a recipe from a photo or pasted text isn't available here.
        </p>
      )}
    </Page>
  );
}

type Start =
  | { readonly kind: "idle" }
  | { readonly kind: "starting" }
  | { readonly kind: "started"; readonly jobId: string }
  | {
      readonly kind: "refused";
      readonly title: string;
      readonly message: string;
    };

/** The photo half: take the parked photo, or ask for one, then read it. */
function PhotoComposer() {
  const client = useClient();
  const [, startPhotoJob] = useMutation(StartRecipePhotoJobMutation);
  const [start, setStart] = useState<Start>({ kind: "idle" });
  const inputId = useId();
  const took = useRef(false);
  const blockers = describeUploadBlockers();

  const read = useCallback(
    async (file: File) => {
      setStart({ kind: "starting" });
      try {
        const fileId = await uploadFile(client, file, "recipe-photo", {
          verify: true,
        });
        const result = unwrapResult(
          (
            await startPhotoJob({
              jobId: crypto.randomUUID(),
              input: { fileId },
            })
          ).data?.startRecipePhotoJob,
          "RecipePhotoJob",
        );
        if (!result.ok) {
          const outcome = aiOutcome(result.error);
          setStart({
            kind: "refused",
            title: outcome.title,
            message: outcome.message,
          });
          return;
        }
        // X10: the shell's watcher follows the job, so the draft's "ready"
        // toast lands wherever the person has gone by then.
        kickAiJobs();
        setStart({ kind: "started", jobId: result.data.id });
      } catch (thrown) {
        setStart({
          kind: "refused",
          title: "Couldn't upload the photo",
          message:
            thrown instanceof UploadUnavailableError
              ? thrown.blockers.join(" ")
              : thrown instanceof UploadRejectedError
                ? thrown.failure.message
                : thrown instanceof Error
                  ? thrown.message
                  : String(thrown),
        });
      }
    },
    [client, startPhotoJob],
  );

  // The photo the sheet was handed: reading starts as the page opens.
  useEffect(() => {
    if (took.current) return;
    took.current = true;
    const parked = takeRecipePhoto();
    if (parked !== null) void read(parked);
  }, [read]);

  return (
    <Page>
      <AppBar title="New recipe" parent="/recipes" />
      {start.kind === "started" ? (
        <Reading
          jobId={start.jobId}
          source="photo"
          onAgain={() => setStart({ kind: "idle" })}
        />
      ) : start.kind === "starting" ? (
        <ReadingProgress label="Uploading the photo" value={null} />
      ) : (
        <div className="flex flex-col gap-4">
          {start.kind === "refused" && (
            <Alert variant="destructive">
              <AlertTitle>{start.title}</AlertTitle>
              <AlertDescription>{start.message}</AlertDescription>
            </Alert>
          )}
          {blockers.length > 0 ? (
            <Alert>
              <AlertTitle className="line-clamp-none">
                Uploads aren't possible from this build
              </AlertTitle>
              <AlertDescription>{blockers.join(" ")}</AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-col items-center gap-4 rounded-lg border border-edge bg-card px-4 py-10 text-center">
              <Camera
                aria-hidden
                className="size-10 text-ink-2"
                strokeWidth={ICON_STROKE}
              />
              <p className="t-body text-ink-2">
                A recipe card, a book page or a screenshot. One recipe per
                photo.
              </p>
              <input
                id={inputId}
                type="file"
                accept="image/*"
                className="peer sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file?.type.startsWith("image/")) void read(file);
                }}
              />
              <Button asChild>
                {/* The input is visually hidden: its focus shows here. */}
                <label
                  htmlFor={inputId}
                  className="cursor-pointer peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50"
                >
                  <Camera aria-hidden />
                  Choose a photo
                </label>
              </Button>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}

/** The paste half: the text, then the same reading. */
function PasteComposer() {
  const [, startTextJob] = useMutation(StartRecipeTextJobMutation);
  const [text, setText] = useState("");
  const [start, setStart] = useState<Start>({ kind: "idle" });
  const textId = useId();
  const tooLong = text.length > PASTE_MAX;

  const read = async () => {
    if (text.trim() === "" || tooLong) return;
    setStart({ kind: "starting" });
    const result = unwrapResult(
      (
        await startTextJob({
          jobId: crypto.randomUUID(),
          input: { text },
        })
      ).data?.startRecipeTextJob,
      "RecipePhotoJob",
    );
    if (!result.ok) {
      const outcome = aiOutcome(result.error);
      setStart({
        kind: "refused",
        title: outcome.title,
        message: outcome.message,
      });
      return;
    }
    kickAiJobs();
    setStart({ kind: "started", jobId: result.data.id });
  };

  return (
    <Page>
      <AppBar title="New recipe" parent="/recipes" />
      {start.kind === "started" ? (
        <Reading
          jobId={start.jobId}
          source="paste"
          onAgain={() => setStart({ kind: "idle" })}
        />
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void read();
          }}
        >
          {start.kind === "refused" && (
            <Alert variant="destructive">
              <AlertTitle>{start.title}</AlertTitle>
              <AlertDescription>{start.message}</AlertDescription>
            </Alert>
          )}
          <Field data-invalid={tooLong || undefined}>
            <FieldLabel htmlFor={textId}>Paste the recipe</FieldLabel>
            <Textarea
              id={textId}
              value={text}
              rows={10}
              className="min-h-56"
              placeholder={
                "Negroni\n1 oz gin\n1 oz Campari\n1 oz sweet vermouth\nStir with ice, strain over a large cube."
              }
              aria-invalid={tooLong || undefined}
              onChange={(event) => setText(event.target.value)}
            />
            <FieldDescription>
              {tooLong
                ? `That's ${text.length} characters; the most it reads is ${PASTE_MAX}.`
                : "The ingredients and the method. You'll check what it read before anything is saved."}
            </FieldDescription>
          </Field>
          <Button
            type="submit"
            disabled={
              text.trim() === "" || tooLong || start.kind === "starting"
            }
            aria-busy={start.kind === "starting" || undefined}
          >
            <AI aria-hidden />
            Read recipe
          </Button>
        </form>
      )}
    </Page>
  );
}

/** Teal: an AI progress state (design §3.1 — teal means the AI is working). */
function ReadingProgress({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-edge bg-card p-4"
      aria-live="polite"
    >
      <div className="flex items-center justify-between t-cap">
        <span className="flex items-center gap-2">
          <AI aria-hidden className="size-4 text-ai" />
          {label}
        </span>
        {value !== null && (
          <span className="tabular">{Math.round(value)}%</span>
        )}
      </div>
      <Progress
        aria-label={label}
        value={value}
        className={cn(
          "bg-ai/20 [&>[data-slot=progress-indicator]]:bg-ai",
          value === null && "motion-safe:animate-pulse",
        )}
      />
    </div>
  );
}

/** A running job: progress, Stop, and on done the draft's editor. */
function Reading({
  jobId,
  source,
  onAgain,
}: {
  jobId: string;
  source: "photo" | "paste";
  onAgain: () => void;
}) {
  const navigate = useNavigate();
  const phase = useRecipeJob(jobId);
  const [, cancel] = useMutation(CancelRecipePhotoJobMutation);
  const doneId = phase?.kind === "done" ? phase.recipeId : null;
  // A Stop or a failure after the job wrote the recipe row leaves a partial
  // draft behind; ask before saying "Nothing was saved".
  const endedId =
    phase?.kind === "cancelled" || phase?.kind === "failed"
      ? phase.recipeId
      : null;
  const [leftover] = useQuery({
    query: RecipeLeftoverQuery,
    variables: { recipeId: endedId ?? "" },
    pause: endedId === null,
    requestPolicy: "network-only",
  });
  const leftoverId =
    endedId !== null && leftover.data?.recipe?.__typename === "Recipe"
      ? leftover.data.recipe.id
      : null;
  const checkingLeftover = endedId !== null && leftover.fetching;

  useEffect(() => {
    if (doneId !== null) navigate.replace(`/recipes/${doneId}/edit`);
  }, [doneId, navigate]);

  if (phase === null || phase.kind === "running") {
    const stage = phase?.stage ?? "EXTRACT";
    const label =
      stage === "EXTRACT"
        ? source === "photo"
          ? "Reading the photo"
          : "Reading the text"
        : (RECIPE_PHOTO_STAGE_LABEL[stage] ?? "Reading");
    return (
      <div className="flex flex-col gap-3">
        <ReadingProgress label={label} value={stageProgress(stage)} />
        <Button
          variant="ghost"
          className="self-start"
          disabled={phase?.cancelRequested === true}
          onClick={() => void cancel({ jobId })}
        >
          {phase?.cancelRequested === true ? "Stopping…" : "Stop"}
        </Button>
      </div>
    );
  }
  if (phase.kind === "done") {
    return <ReadingProgress label="Opening your draft" value={100} />;
  }
  if (phase.kind === "stalled") {
    return (
      <Alert>
        <AlertTitle>Still reading</AlertTitle>
        <AlertDescription>
          <p>
            This is taking longer than usual. Nothing was cancelled: your draft
            will be in{" "}
            <Link href="/recipes" underline="always" className="text-ink">
              Your drafts
            </Link>{" "}
            when it's done.
          </p>
        </AlertDescription>
      </Alert>
    );
  }
  if (checkingLeftover) {
    return <ReadingProgress label="Checking what was saved" value={null} />;
  }
  if (phase.kind === "cancelled") {
    return (
      <div className="flex flex-col gap-3">
        <Alert>
          <AlertDescription>
            {leftoverId === null
              ? "Stopped. Nothing was saved."
              : "Stopped. What it had read so far is a draft only you can see."}
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          {leftoverId !== null && (
            <Button variant="secondary" asChild>
              <Link href={`/recipes/${leftoverId}/edit`} underline="none">
                Review the draft
              </Link>
            </Button>
          )}
          <Button
            variant={leftoverId === null ? "secondary" : "ghost"}
            onClick={onAgain}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }
  const copy = readFailureCopy(phase.reason, source, leftoverId !== null);
  return (
    <div className="flex flex-col gap-3">
      <AiStatus
        outcome={{
          kind: copy.kind,
          title: copy.title,
          message: copy.message,
          retryAt: null,
          canRetry: false,
          tone: "neutral",
        }}
      />
      <div className="flex flex-wrap gap-2">
        {leftoverId !== null && (
          <Button variant="secondary" asChild>
            <Link href={`/recipes/${leftoverId}/edit`} underline="none">
              Review the draft
            </Link>
          </Button>
        )}
        <Button
          variant={leftoverId === null ? "secondary" : "ghost"}
          onClick={onAgain}
        >
          {source === "photo" ? "Choose another photo" : "Edit the text"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/recipes/new?from=type" underline="none">
            Type it instead
          </Link>
        </Button>
      </div>
    </div>
  );
}
