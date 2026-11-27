"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useClient, useMutation, useQuery } from "urql";
import { AIDraftField } from "@/components/app/AIDraftField";
import { IconButton } from "@/components/app/IconButton";
import {
  Add,
  Camera,
  Close,
  ICON_STROKE,
  People,
  Place,
  Schedule,
} from "@/components/app/icons";
import { RatingInput } from "@/components/app/RatingInput";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { ApiError } from "@/components/cellar-api/ApiError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { aiOutcome } from "@/lib/ai/outcome";
import { uploadFile } from "@/lib/api/files";
import { type ApiFailure, unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import { CompanionPicker, type DrinkLogFriend } from "./CompanionPicker";
import {
  addTag,
  companionsChanged,
  type DraftPlace,
  EMPTY_DRAFT,
  type FlavourSuggestion,
  type LogDraft,
  type LogSubject,
  logInput,
  MAX_CHECK_IN_NOTE_LENGTH,
  noteKey,
  openSuggestions,
  removeTag,
  shouldSuggest,
  toggleId,
  updateInput,
  whenLabel,
} from "./log-draft";
import { announceDrinkLogChanged } from "./log-events";
import {
  DrinkLogPlacePickerQuery,
  LogDrinkMutation,
  SetDrinkLogCompanionsMutation,
  SuggestFlavourTagsMutation,
  UpdateDrinkLogMutation,
} from "./queries";
import { WhenPicker } from "./WhenPicker";

export type { DrinkLogFriend } from "./CompanionPicker";

/** How long the note must sit still before its flavours are asked for. */
const SUGGEST_AFTER_MS = 1200;
/** How long "Where?" waits after the last keystroke (it embeds the phrase). */
const PLACE_SEARCH_AFTER_MS = 400;

export type LogDrinkMode =
  | { readonly kind: "new" }
  | {
      readonly kind: "edit";
      readonly entryId: string;
      readonly initial: LogDraft;
      readonly photoUrl?: string | null;
      /**
       * The entry is yours and you logged it, so "Who with" can still be
       * changed (`setDrinkLogCompanions`). A friend's entry about you is
       * not yours to re-staff.
       */
      readonly canEditCompanions?: boolean;
    };

export type LogDrinkSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: LogSubject;
  mode?: LogDrinkMode;
  /**
   * The viewer's friends, when the page already read them (the bottle page
   * does); otherwise the sheet reads them itself when it opens.
   */
  friends?: readonly DrinkLogFriend[];
  /**
   * X07: where a new log starts — the place whose menu "I'm having this"
   * was tapped on. Only a starting value: the person can clear or change it.
   * Ignored in edit mode, which starts from the entry itself.
   */
  defaultPlace?: DraftPlace | null;
  /**
   * After a write: the new entry's id and how many drinkers it wrote, so the
   * caller can toast and refresh. The sheet has already closed.
   */
  onSaved?: (saved: {
    readonly entryId: string;
    readonly drinkerCount: number;
    readonly kind: "new" | "edit";
  }) => void;
};

const mintId = (): string => crypto.randomUUID();

/**
 * "Log a drink" (X02) — a bottle-optional log entry in one thumb-reachable
 * sheet: this glass's score (half stars, **not** the review — D5), a note,
 * flavour tags, where, who with, and a photo. Every field is optional; "Log
 * it" with nothing filled in records that you had it, today.
 *
 * Reached from the item page's "Your log" and from the existing check-in
 * buttons (cellar overview, bottle page), which pass the bottle along.
 *
 * ## Suggested flavours
 *
 * When the note has sat still for a moment, it is sent to
 * `suggestFlavourTags` — an abstaining seam that returns only words the note
 * itself contains. They appear under a dashed "Suggested" mark
 * (`AIDraftField source="suggested"`) and do nothing until tapped: a tap
 * makes one a tag of yours; "Not these" hides them. A note that names no
 * flavour gets no chips, and an AI that is unavailable or out of allowance
 * says so in a footnote — logging never waits on it.
 */
export function LogDrinkSheet({
  open,
  onOpenChange,
  subject,
  mode = { kind: "new" },
  friends,
  defaultPlace = null,
  onSaved,
}: LogDrinkSheetProps) {
  const isNew = mode.kind === "new";
  const initial: LogDraft =
    mode.kind === "edit"
      ? mode.initial
      : defaultPlace === null
        ? EMPTY_DRAFT
        : { ...EMPTY_DRAFT, place: defaultPlace };
  const [draft, setDraft] = useState<LogDraft>(initial);
  // The id `logDrink` is addressed by: minted once per opening, so a retry
  // after a dropped response is the same log, and Undo knows what to delete.
  const [logId, setLogId] = useState<string>(() =>
    mode.kind === "edit" ? mode.entryId : mintId(),
  );
  const [error, setError] = useState<ApiFailure | null>(null);

  // Reset each time the sheet opens, so a cancelled draft never leaks into
  // the next one.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setDraft(
        mode.kind === "edit"
          ? mode.initial
          : defaultPlace === null
            ? EMPTY_DRAFT
            : { ...EMPTY_DRAFT, place: defaultPlace },
      );
      setLogId(mode.kind === "edit" ? mode.entryId : mintId());
      setError(null);
    }
    wasOpen.current = open;
  }, [open, mode, defaultPlace]);

  const [logState, logDrink] = useMutation(LogDrinkMutation);
  const [updateState, updateDrinkLog] = useMutation(UpdateDrinkLogMutation);
  const [companionsState, setCompanions] = useMutation(
    SetDrinkLogCompanionsMutation,
  );
  const saving =
    logState.fetching || updateState.fetching || companionsState.fetching;
  const [whenProblem, setWhenProblem] = useState<string | null>(null);
  const canEditCompanions = mode.kind === "edit" && mode.canEditCompanions;

  const save = async () => {
    setError(null);
    if (mode.kind === "edit") {
      const patch = updateInput(mode.initial, draft);
      const restaffed =
        canEditCompanions === true &&
        companionsChanged(mode.initial.companionIds, draft.companionIds);
      if (Object.keys(patch).length === 0 && !restaffed) {
        onOpenChange(false);
        return;
      }
      if (Object.keys(patch).length > 0) {
        const result = unwrapResult(
          (await updateDrinkLog({ id: mode.entryId, input: patch })).data
            ?.updateDrinkLog,
          "ItemCheckIn",
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }
      if (restaffed) {
        const result = unwrapResult(
          (
            await setCompanions({
              id: mode.entryId,
              companionIds: [...draft.companionIds],
            })
          ).data?.setDrinkLogCompanions,
          "ItemCheckIn",
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }
      onOpenChange(false);
      announceDrinkLogChanged(subject.itemId);
      onSaved?.({ entryId: mode.entryId, drinkerCount: 1, kind: "edit" });
      return;
    }
    const result = unwrapResult(
      (await logDrink({ id: logId, input: logInput(subject, draft) })).data
        ?.logDrink,
      "LoggedDrinkPayload",
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
    announceDrinkLogChanged(subject.itemId);
    onSaved?.({
      entryId: result.data.entry.id,
      drinkerCount: result.data.drinkerCount,
      kind: "new",
    });
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
      dismissible={!saving}
      title={isNew ? "Log a drink" : "Edit log"}
      description={subject.itemName}
      footer={
        // CROSS-LOT form-sheet footer: the quiet way out left, primary right.
        <div className="flex w-full items-center gap-3">
          <Button
            variant="quiet"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="min-w-0 flex-1"
            disabled={saving || whenProblem !== null}
            aria-busy={saving || undefined}
            onClick={() => void save()}
          >
            {saving && <Spinner aria-hidden />}
            {isNew ? "Log it" : "Save"}
          </Button>
        </div>
      }
    >
      {open && (
        <LogDrinkForm
          draft={draft}
          onChange={setDraft}
          subject={subject}
          logId={logId}
          allowCompanions={isNew || canEditCompanions === true}
          isNew={isNew}
          onWhenProblem={setWhenProblem}
          friends={friends}
          initialPhotoUrl={
            mode.kind === "edit" ? (mode.photoUrl ?? null) : null
          }
          error={error}
        />
      )}
    </ResponsiveDialog>
  );
}

type FormProps = {
  draft: LogDraft;
  onChange: (next: LogDraft) => void;
  subject: LogSubject;
  logId: string;
  allowCompanions: boolean;
  /** A new log defaults to now; an edit shows the entry's own time. */
  isNew?: boolean;
  onWhenProblem?: (problem: string | null) => void;
  friends?: readonly DrinkLogFriend[];
  initialPhotoUrl: string | null;
  error: ApiFailure | null;
};

/**
 * The sheet's body, apart from the modal around it — the part a component
 * test can mount without a portal.
 */
export function LogDrinkForm({
  draft,
  onChange,
  subject,
  logId,
  allowCompanions,
  isNew = true,
  onWhenProblem,
  friends,
  initialPhotoUrl,
  error,
}: FormProps) {
  const patch = (next: Partial<LogDraft>) => onChange({ ...draft, ...next });
  // Who / When / Where / Photo: four picker buttons, one open at a time
  // (Cellars-Pour 25). A time to fix opens When by itself.
  const [shown, setShown] = useState<Picker | null>(isNew ? null : "when");
  const toggle = (picker: Picker) =>
    setShown((open) => (open === picker ? null : picker));
  const [now] = useState(() => new Date());
  const companions = draft.companionIds.length;

  return (
    <div className="flex flex-col gap-5 pb-2">
      <RatingInput
        label="Score this glass"
        value={draft.score}
        onChange={(score) => patch({ score })}
        onClear={() => patch({ score: null })}
      />

      <NoteAndTags
        draft={draft}
        onChange={onChange}
        subject={subject}
        logId={logId}
      />

      <div className="grid grid-cols-2 gap-3" data-slot="log-pickers">
        {allowCompanions && (
          <PickerButton
            picker="who"
            shown={shown}
            onToggle={toggle}
            icon={<People aria-hidden strokeWidth={ICON_STROKE} />}
            set={companions > 0}
            label="Who"
          >
            {companions === 0 ? "Just me" : `With ${companions}`}
          </PickerButton>
        )}
        <PickerButton
          picker="when"
          shown={shown}
          onToggle={toggle}
          icon={<Schedule aria-hidden strokeWidth={ICON_STROKE} />}
          set={draft.drankAt !== null}
          label="When"
        >
          {whenLabel(draft.drankAt, now)}
        </PickerButton>
        <PickerButton
          picker="where"
          shown={shown}
          onToggle={toggle}
          icon={<Place aria-hidden strokeWidth={ICON_STROKE} />}
          set={draft.place !== null}
          label="Where"
        >
          {draft.place?.name ?? "Where"}
        </PickerButton>
        <PickerButton
          picker="photo"
          shown={shown}
          onToggle={toggle}
          icon={<Camera aria-hidden strokeWidth={ICON_STROKE} />}
          set={draft.photoFileId !== null}
          label="Photo"
        >
          {draft.photoFileId === null ? "Photo" : "1 photo"}
        </PickerButton>
      </div>

      {shown === "who" && allowCompanions && (
        <CompanionPicker
          heading={null}
          preloaded={friends}
          selected={draft.companionIds}
          onToggle={(id) =>
            patch({ companionIds: toggleId(draft.companionIds, id) })
          }
        />
      )}
      {/* Mounted while closed too, so a time it cannot save still holds
          the button; it shows only when open. */}
      <div hidden={shown !== "when"}>
        <WhenPicker
          value={draft.drankAt}
          onChange={(drankAt) => patch({ drankAt })}
          allowNow={isNew}
          onProblem={onWhenProblem}
        />
      </div>
      {shown === "where" && (
        <PlacePicker
          place={draft.place}
          onChange={(place) => patch({ place })}
        />
      )}
      {(shown === "photo" || draft.photoFileId !== null) && (
        <PhotoPicker
          fileId={draft.photoFileId}
          initialUrl={initialPhotoUrl}
          onChange={(photoFileId) => patch({ photoFileId })}
        />
      )}

      {error !== null && <ApiError error={error} />}
    </div>
  );
}

type Picker = "who" | "when" | "where" | "photo";

/** One of the four: glyph and what it holds now; on (sel) once it is set. */
function PickerButton({
  picker,
  shown,
  onToggle,
  icon,
  set,
  label,
  children,
}: {
  picker: Picker;
  shown: Picker | null;
  onToggle: (picker: Picker) => void;
  icon: ReactNode;
  set: boolean;
  label: string;
  children: string;
}) {
  return (
    <Button
      variant="outline"
      aria-expanded={shown === picker}
      aria-label={`${label}: ${children}`}
      onClick={() => onToggle(picker)}
      className={cn(
        "min-w-0 justify-start",
        (set || shown === picker) && "border-edge-2 bg-sel text-ink",
      )}
    >
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </Button>
  );
}

/* -------------------------------------------------------------------------- */
/* Note, suggested flavours, tags                                              */
/* -------------------------------------------------------------------------- */

function NoteAndTags({
  draft,
  onChange,
  subject,
  logId,
}: Pick<FormProps, "draft" | "onChange" | "subject" | "logId">) {
  const ids = useId();
  const [tagText, setTagText] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<FlavourSuggestion[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [aiNote, setAiNote] = useState<string | null>(null);
  // An edit opens with a note already written: that note was the drinker's,
  // and asking about it again on every open would spend a call for nothing.
  const lastAsked = useRef<string | null>(
    draft.note.trim() === "" ? null : noteKey(draft.note),
  );
  const [suggestState, suggest] = useMutation(SuggestFlavourTagsMutation);

  const ask = async (note: string) => {
    if (!shouldSuggest(note, lastAsked.current)) return;
    lastAsked.current = noteKey(note);
    const result = unwrapResult(
      (
        await suggest({
          logId,
          note,
          itemType: subject.itemType,
          existing: [...draft.tags],
        })
      ).data?.suggestFlavourTags,
      "FlavourTagSuggestionsPayload",
    );
    if (!result.ok) {
      // Logging never waits on the AI: say why there are no chips, once.
      const outcome = aiOutcome(result.error);
      setAiNote(
        outcome.kind === "unavailable"
          ? null
          : `Flavour suggestions: ${outcome.message}`,
      );
      return;
    }
    setAiNote(null);
    setSuggestions(
      result.data.suggestions.edges.map((edge) => ({
        tag: edge.node.tag,
        evidence: edge.node.evidence,
      })),
    );
  };

  // Ask once the note has been still for a moment.
  const askRef = useRef(ask);
  askRef.current = ask;
  useEffect(() => {
    const note = draft.note;
    if (!shouldSuggest(note, lastAsked.current)) return;
    const timer = setTimeout(() => void askRef.current(note), SUGGEST_AFTER_MS);
    return () => clearTimeout(timer);
  }, [draft.note]);

  const shown = openSuggestions(suggestions, draft.tags, dismissed);

  const add = (raw: string) => {
    const result = addTag(draft.tags, raw);
    setTagError(result.ok ? null : result.message);
    if (result.tags !== draft.tags) onChange({ ...draft, tags: result.tags });
    return result.ok;
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${ids}-note`}>
      <label
        id={`${ids}-note`}
        htmlFor={`${ids}-note-input`}
        className="t-cap font-semibold"
      >
        Tasting note
      </label>
      <Textarea
        id={`${ids}-note-input`}
        value={draft.note}
        maxLength={MAX_CHECK_IN_NOTE_LENGTH}
        rows={3}
        placeholder="What did you notice? Dark cherry, a little smoke…"
        onChange={(event) => onChange({ ...draft, note: event.target.value })}
        onBlur={() => void ask(draft.note)}
      />

      {suggestState.fetching && (
        <p className="t-cap flex items-center gap-2 text-ai" role="status">
          <Spinner aria-hidden className="size-3.5" />
          Finding the flavours in your note…
        </p>
      )}

      {shown.length > 0 && (
        <AIDraftField source="suggested" drafted>
          <div className="flex flex-col gap-2 pt-6">
            <p className="t-cap text-ink-3" id={`${ids}-suggested`}>
              From your note — tap to add
            </p>
            <ul
              aria-labelledby={`${ids}-suggested`}
              className="flex flex-wrap gap-2"
            >
              {shown.map((suggestion) => (
                <li key={suggestion.tag}>
                  <button
                    type="button"
                    data-slot="suggested-tag"
                    onClick={() => add(suggestion.tag)}
                    aria-label={`Add ${suggestion.tag} (from “${suggestion.evidence}”)`}
                    className="relative inline-flex h-9 items-center gap-1 rounded-full border border-line border-dashed bg-surface-2 px-3 font-medium text-ink-1 text-sm transition-transform duration-(--ca-dur-micro) ease-standard after:absolute after:-inset-y-1 after:inset-x-0 after:content-[''] active:scale-97 motion-reduce:active:scale-100"
                  >
                    <Add aria-hidden className="size-3.5" />
                    {suggestion.tag}
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() =>
                    setDismissed((current) => [
                      ...current,
                      ...shown.map((suggestion) => suggestion.tag),
                    ])
                  }
                  className="relative inline-flex h-9 items-center px-2 text-ink-3 text-sm underline-offset-2 after:absolute after:-inset-y-1 after:inset-x-0 after:content-[''] hover:underline"
                >
                  Not these
                </button>
              </li>
            </ul>
          </div>
        </AIDraftField>
      )}
      {aiNote !== null && <p className="t-cap text-ink-3">{aiNote}</p>}

      <div className="flex flex-col gap-2">
        <label htmlFor={`${ids}-tag`} className="t-cap text-ink-3">
          Flavour tags
        </label>
        {draft.tags.length > 0 && (
          <ul aria-label="Your tags" className="flex flex-wrap gap-2">
            {draft.tags.map((tag) => (
              <li key={tag}>
                <span className="inline-flex h-9 items-center gap-1 rounded-full bg-ink-1 pr-1 pl-3 font-medium text-background text-sm">
                  {tag}
                  <button
                    type="button"
                    aria-label={`Remove ${tag}`}
                    onClick={() =>
                      onChange({ ...draft, tags: removeTag(draft.tags, tag) })
                    }
                    className="relative inline-flex size-7 items-center justify-center rounded-full after:absolute after:-inset-2 after:content-['']"
                  >
                    <Close aria-hidden className="size-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (add(tagText)) setTagText("");
          }}
        >
          <Input
            id={`${ids}-tag`}
            value={tagText}
            onChange={(event) => setTagText(event.target.value)}
            placeholder="Add a flavour"
            autoComplete="off"
            enterKeyHint="done"
            className="h-11"
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={tagText.trim() === ""}
          >
            Add
          </Button>
        </form>
        {tagError !== null && (
          <p role="alert" className="t-cap text-danger">
            {tagError}
          </p>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Where                                                                       */
/* -------------------------------------------------------------------------- */

function PlacePicker({
  place,
  onChange,
}: {
  place: LogDraft["place"];
  onChange: (place: LogDraft["place"]) => void;
}) {
  const ids = useId();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(
      () => setQuery(text.trim()),
      PLACE_SEARCH_AFTER_MS,
    );
    return () => clearTimeout(timer);
  }, [text]);

  const [{ data, fetching, error }] = useQuery({
    query: DrinkLogPlacePickerQuery,
    variables: { query, first: 5 },
    pause: place !== null || query.length < 2,
  });
  const result = unwrapResult(data?.placeSearch, "PlaceSearchConnection");
  const hits = result.ok
    ? result.data.edges.map((edge) => ({
        id: edge.node.place.id,
        name: edge.node.place.displayName ?? edge.node.place.name,
        locality: edge.node.place.locality,
      }))
    : [];

  return (
    <section className="flex flex-col gap-2" aria-labelledby={`${ids}-where`}>
      <label
        id={`${ids}-where`}
        htmlFor={`${ids}-where-input`}
        className="t-cap font-semibold"
      >
        Where
      </label>
      {place !== null ? (
        <div className="flex min-h-11 items-center gap-3 rounded-md bg-surface-2 pr-1 pl-3">
          <Place aria-hidden className="size-4 text-ink-2" />
          <span className="t-body min-w-0 flex-1 truncate">{place.name}</span>
          <IconButton
            aria-label={`Remove ${place.name}`}
            variant="ghost"
            onClick={() => onChange(null)}
          >
            <Close aria-hidden />
          </IconButton>
        </div>
      ) : (
        <>
          <Input
            id={`${ids}-where-input`}
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="A bar, a restaurant, a shop…"
            autoComplete="off"
            className="h-11"
          />
          {fetching && query.length >= 2 && (
            <p className="t-cap text-ink-3" role="status">
              Searching places…
            </p>
          )}
          {!fetching &&
            query.length >= 2 &&
            (error !== undefined || (data !== undefined && !result.ok)) && (
              <p className="t-cap text-ink-3">
                Place search isn't available right now. You can log without a
                place.
              </p>
            )}
          {!fetching && query.length >= 2 && result.ok && hits.length === 0 && (
            <p className="t-cap text-ink-3">No places match “{query}”.</p>
          )}
          {hits.length > 0 && (
            <ul
              aria-label="Places"
              className="flex flex-col divide-y divide-line overflow-hidden rounded-md bg-surface-2"
            >
              {hits.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange({ id: hit.id, name: hit.name });
                      setText("");
                    }}
                    className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left active:bg-surface-3"
                  >
                    <Place aria-hidden className="size-4 shrink-0 text-ink-3" />
                    <span className="flex min-w-0 flex-col">
                      <span className="t-body truncate">{hit.name}</span>
                      {hit.locality !== null && (
                        <span className="t-cap text-ink-3 truncate">
                          {hit.locality}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Photo                                                                       */
/* -------------------------------------------------------------------------- */

function PhotoPicker({
  fileId,
  initialUrl,
  onChange,
}: {
  fileId: string | null;
  initialUrl: string | null;
  onChange: (fileId: string | null) => void;
}) {
  const client = useClient();
  const input = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const id = await uploadFile(client, file, "check-in-photo", {
        verify: true,
      });
      setPreview(URL.createObjectURL(file));
      onChange(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const shown = fileId === null ? null : preview;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="t-cap font-semibold">Photo</h3>
      {shown !== null ? (
        <div className="relative w-28 overflow-hidden rounded-md bg-surface-2">
          {/* biome-ignore lint/performance/noImgElement: a local blob preview, not a remote image next/image could optimise */}
          <img
            src={shown}
            alt="What you drank"
            className="aspect-[3/4] w-full object-cover"
          />
          <IconButton
            aria-label="Remove photo"
            variant="secondary"
            size="sm"
            className="absolute top-1 right-1"
            onClick={() => {
              onChange(null);
              setPreview(null);
            }}
          >
            <Close aria-hidden />
          </IconButton>
        </div>
      ) : (
        <Button
          variant="outline"
          className={cn("self-start")}
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={() => input.current?.click()}
        >
          {busy ? <Spinner aria-hidden /> : <Camera aria-hidden />}
          Add a photo
        </Button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file !== undefined) void upload(file);
        }}
      />
      {error !== null && (
        <p role="alert" className="t-cap text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
