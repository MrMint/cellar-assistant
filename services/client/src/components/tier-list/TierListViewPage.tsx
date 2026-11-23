"use client";

/**
 * `82450ad1:src/components/tier-list/TierListViewPage.tsx`, restored: header
 * (name, description, privacy chip, count), the map / share / edit icon
 * buttons, and the URL-backed Rankings / Insights tabs (`?tab=`, with
 * `?item=` scrolling to an entry).
 *
 * X23 / D4 — **Arrange** replaces the padlock. The board is read-only by
 * default, the owner's included: the whole row opens the entry. The owner's
 * Arrange button turns the page into its editing mode — drag handles and
 * remove buttons on the rows, the tabs put away, and a bar in the thumb zone
 * with Undo, Redo, Add entry and Done. Undo and Redo step the list's
 * server-side edit history (`TierList.editHistory`), so a mistake from
 * yesterday is still one tap away, and every edit's toast offers the same
 * Undo. The old `isEditingLocked` padlock is retired, in the API too (X16).
 *
 * Kept from the rewrite (decision 2): the in-page **Add entry**, now inside
 * Arrange (and on an empty list's own empty state). A new entry lands in the
 * band your own rating puts it in (`bandForScore`), Unrated without one.
 *
 * On the app's primitives (D20): `IconButton`s named by their tooltips,
 * Radix tabs, `notify` toasts, `EmptyState`.
 */

import { useRouter } from "next/navigation";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActionBar } from "@/components/app/ActionBar";
import { AppBar } from "@/components/app/AppBar";
import { EmptyState } from "@/components/app/EmptyState";
import { IconButton } from "@/components/app/IconButton";
import {
  Add,
  type AppIcon,
  Arrange,
  Check,
  Edit,
  ICON_STROKE,
  Lock,
  MapIcon,
  People,
  Public,
  Ranked,
  Redo,
  Share,
  Undo,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { notify } from "@/components/app/notify";
import { MorphTitle } from "@/components/app/RouteTransition";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { absoluteUrl, canonicalPath } from "@/lib/share/routes";
import { tierListShareBlock } from "@/lib/share/share-rules";
import { useShareLink } from "@/lib/share/use-share-link";
import { type AddEntryCandidate, AddEntryModal } from "./AddEntryModal";
import { useTierListActions } from "./actions";
import { itemTypeOfList, onListHrefs } from "./adapter";
import { addedMessage } from "./add-entry";
import {
  bandForScore,
  historyActionLabel,
  historyStepMessage,
  stepSeq,
  type TierListHistoryView,
} from "./history";
import { TierListInsightsPanel } from "./insights/TierListInsightsPanel";
import { TIER_LIST_EDIT_TOAST, TierListView } from "./TierListView";
import type { TierListData, TierListInsightsData } from "./types";

interface TierListViewPageProps {
  data: TierListData;
  insightsData: TierListInsightsData;
}

const privacyLabels: Record<string, { icon: AppIcon; label: string }> = {
  PRIVATE: { icon: Lock, label: "Private" },
  FRIENDS: { icon: People, label: "Friends" },
  PUBLIC: { icon: Public, label: "Public" },
};

/** A header action's hover hint; on touch its `aria-label` names it. */
function Hint({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const TRIGGER =
  "h-full rounded-sm font-medium text-ink-2 data-[state=active]:bg-surface-3 data-[state=active]:text-ink-1 dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-surface-3";

/**
 * How long an Undo tapped right after an edit on this page waits for the
 * refreshed history to name that edit (`markEdited` cannot know its seq),
 * and how often it looks. The refresh is a few hundred ms; past this the
 * tap says so instead of stepping blind.
 */
const STEP_SEQ_WAIT_MS = 4000;
const STEP_SEQ_POLL_MS = 100;

/**
 * The Arrange bar's two labelled buttons: glyphs off below 400 px, tighter
 * padding below 360, so Undo · Redo · Add entry · Done fit a 320 pt phone
 * without the bar overflowing its 16 pt gutters.
 */
const ARRANGE_BUTTON =
  "min-w-0 flex-1 max-[399px]:[&>svg]:hidden max-[359px]:px-3 max-[359px]:has-[>svg]:px-3";

const NO_HISTORY: TierListHistoryView = {
  canUndo: false,
  canRedo: false,
  undo: null,
  redo: null,
};

/**
 * Where Undo / Redo stand, from the server, with an edit made on this page
 * reflected before the refresh lands: a fresh edit can always be undone and
 * has always cleared Redo. The server's answer replaces it when it comes.
 */
function useHistory(server: TierListHistoryView | null) {
  const [history, setHistory] = useState<TierListHistoryView>(
    server ?? NO_HISTORY,
  );
  useEffect(() => {
    setHistory(server ?? NO_HISTORY);
  }, [server]);
  const markEdited = useCallback(() => {
    setHistory((current) => ({
      ...current,
      canUndo: true,
      canRedo: false,
      // Which edit it is arrives with the refresh; until then the button
      // says "Undo" without naming it.
      undo: null,
      redo: null,
    }));
  }, []);
  return { history, setHistory, markEdited };
}

export function TierListViewPage({
  data,
  insightsData,
}: TierListViewPageProps) {
  const TAB_VALUES = ["rankings", "insights"] as const;
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(TAB_VALUES).withDefault("rankings"),
  );
  const [selectedItemId] = useQueryState("item");

  const privacyInfo = privacyLabels[data.privacy] ?? privacyLabels.PRIVATE;
  const PrivacyIcon = privacyInfo.icon;

  const router = useRouter();
  const { addItemsToTierListAction, undoAction, redoAction } =
    useTierListActions();
  const [arranging, setArranging] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  /**
   * Bumped on every open and used as the picker's `key`, so each open starts
   * from an empty search: a reopened picker showing the last query's rows
   * reads as fresh results.
   */
  const [addSession, setAddSession] = useState(0);
  const onList = useMemo(() => onListHrefs(data.items), [data.items]);
  // X08: an item list's "Try This Next" can be saved from; a place list's
  // suggestion is a kind of venue, with nothing to look up.
  const tryNextType = itemTypeOfList(data.listType);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const { history, setHistory, markEdited } = useHistory(data.history);
  const [stepping, setStepping] = useState(false);
  const steppingRef = useRef(false);
  /** The latest history, for a step that waits on the refresh to name it. */
  const historyRef = useRef(history);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  /**
   * The `seq` an Undo or Redo names (`expectedSeq`): the step the page
   * shows. Just after an edit made here the page knows *that* it can undo but
   * not *which* edit until the refresh lands, so it waits for that — never
   * steps blind, which is what let a stale tab take back another tab's edit.
   *
   * `"nothing"` when the history it now holds has no such step (a refresh
   * after another tab's change can take it away); `"pending"` when the
   * refresh has not named it within `STEP_SEQ_WAIT_MS`.
   */
  const seqToStep = useCallback(
    async (
      direction: "undo" | "redo",
    ): Promise<number | "nothing" | "pending"> => {
      for (let waited = 0; ; waited += STEP_SEQ_POLL_MS) {
        const current = historyRef.current;
        const seq = stepSeq(current, direction);
        if (seq !== null) return seq;
        const possible =
          direction === "undo" ? current.canUndo : current.canRedo;
        if (!possible) return "nothing";
        if (waited >= STEP_SEQ_WAIT_MS) return "pending";
        await new Promise((resolve) => setTimeout(resolve, STEP_SEQ_POLL_MS));
      }
    },
    [],
  );

  const canArrange = data.isOwner;
  const isArranging = canArrange && arranging;

  const openAdd = useCallback(() => {
    setAddError(null);
    setAddSession((session) => session + 1);
    setAddOpen(true);
  }, []);

  const share = useShareLink();
  const handleShare = useCallback(async () => {
    // X17: a PRIVATE list's link opens for its owner only, so a share would
    // send everyone else to "doesn't exist or isn't shared with you".
    const blocked = tierListShareBlock(data.privacy, data.isOwner);
    if (blocked !== null) {
      notify(blocked.message, { description: blocked.description });
      return;
    }
    await share({
      url: absoluteUrl(
        window.location.origin,
        canonicalPath({ kind: "tier-list", id: data.id }),
      ),
      title: data.name,
      text: data.isOwner
        ? `My ranking: ${data.name}`
        : `${data.name} on Cellar Assistant`,
    });
  }, [data.id, data.name, data.privacy, data.isOwner, share]);

  /**
   * One step of the list's history. Its toast offers the opposite step, so
   * an Undo by mistake is itself one tap from being taken back.
   */
  const step = useCallback(
    async (direction: "undo" | "redo", expected?: number) => {
      if (steppingRef.current) return;
      steppingRef.current = true;
      setStepping(true);
      const expectedSeq = expected ?? (await seqToStep(direction));
      if (typeof expectedSeq !== "number") {
        steppingRef.current = false;
        setStepping(false);
        const verb = direction === "undo" ? "Undo" : "Redo";
        notify(
          expectedSeq === "nothing"
            ? `Nothing to ${direction} on this list any more.`
            : `Still catching up with your last change. Try ${verb} again.`,
          { tone: "error", id: TIER_LIST_EDIT_TOAST },
        );
        router.refresh();
        return;
      }
      const result =
        direction === "undo"
          ? await undoAction(data.id, expectedSeq)
          : await redoAction(data.id, expectedSeq);
      steppingRef.current = false;
      setStepping(false);
      if (!result.success) {
        notify(result.error, { tone: "error", id: TIER_LIST_EDIT_TOAST });
        router.refresh();
        return;
      }
      setHistory(result.history);
      const opposite = direction === "undo" ? "redo" : "undo";
      notify(historyStepMessage(direction, result.applied), {
        id: TIER_LIST_EDIT_TOAST,
        actionLabel: opposite === "redo" ? "Redo" : "Undo",
        // The opposite step is this very edit: name it, so the toast can
        // only ever reverse what it announced.
        undo: () => void step(opposite, result.applied.seq),
      });
      router.refresh();
    },
    [data.id, redoAction, router, seqToStep, setHistory, undoAction],
  );

  // ⌘Z / ⇧⌘Z (Ctrl on other systems) while arranging, outside text fields
  // and not behind the Add entry sheet, whose own focus owns the keyboard.
  useEffect(() => {
    if (!isArranging || addOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z")
        return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("input, textarea, [contenteditable='true']") !== null
      ) {
        return;
      }
      const direction = event.shiftKey ? "redo" : "undo";
      if (direction === "undo" ? !history.canUndo : !history.canRedo) return;
      event.preventDefault();
      void step(direction);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addOpen, history.canRedo, history.canUndo, isArranging, step]);

  /**
   * X16: everything picked goes on as one multi-add — one edit, so the
   * toast's Undo takes all of it back — each in the band your own verdict
   * gives it, Unrated without one.
   */
  const handleAdd = useCallback(
    async (candidates: AddEntryCandidate[]) => {
      if (candidates.length === 0) return;
      setAdding(true);
      setAddError(null);
      const result = await addItemsToTierListAction(
        data.id,
        candidates.map((candidate) => ({
          id: candidate.id,
          entityType: candidate.entityType,
          band: bandForScore(candidate.myScore),
        })),
      );
      setAdding(false);
      if (!result.success) {
        setAddError(result.error);
        return;
      }
      setAddOpen(false);
      const message = addedMessage(candidates, result.added, result.skipped);
      if (result.added === 0) {
        notify(message, { id: TIER_LIST_EDIT_TOAST });
        return;
      }
      markEdited();
      // The add's own edit, read back with it: the toast's Undo takes back
      // exactly that, or is not offered (`addedEntriesEditSeq`).
      const editSeq = result.editSeq;
      notify(message, {
        id: TIER_LIST_EDIT_TOAST,
        ...(editSeq === null ? {} : { undo: () => void step("undo", editSeq) }),
      });
      router.refresh();
    },
    [addItemsToTierListAction, data.id, markEdited, router, step],
  );

  const handleEdited = useCallback(() => markEdited(), [markEdited]);
  const handleUndo = useCallback(() => void step("undo"), [step]);

  const isEmpty = data.items.length === 0;

  const board = isEmpty ? (
    <EmptyState
      illustration={<Ranked aria-hidden strokeWidth={ICON_STROKE} />}
      title="Nothing ranked yet."
      description={
        data.isOwner
          ? "Add something you've tried. Your rating picks its band."
          : "When this list ranks something, it shows here."
      }
      action={
        // Arranging, the bar below already holds Add entry.
        data.isOwner && !isArranging ? (
          <Button
            onClick={() => {
              setArranging(true);
              openAdd();
            }}
          >
            <Add aria-hidden strokeWidth={ICON_STROKE} />
            Add from what you&apos;ve tasted
          </Button>
        ) : undefined
      }
    />
  ) : (
    <TierListView
      tierListId={data.id}
      items={data.items}
      isOwner={data.isOwner}
      arranging={isArranging}
      selectedItemId={selectedItemId ?? undefined}
      onEdited={handleEdited}
      onUndo={handleUndo}
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-[800px] flex-col gap-4 sm:px-4">
      {/* W-10: Back, like every other pushed page; the large title below
          stays the page's h1 (and the morph target), so the bar has none. */}
      <AppBar parent="/tier-lists" />
      {/* Header. Only the title shares its row with the actions: at 390 an
          owner of a place list has four of them, and a description in the
          title's column wrapped every two or three words. */}
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-4">
          {/* B05: the target of TierListCard's title morph (H-7). */}
          <MorphTitle>
            <h1 className="type-title-1 min-w-0 flex-1 break-words text-ink-1">
              {data.name}
            </h1>
          </MorphTitle>
          {!isArranging && (
            <div className="flex shrink-0 gap-1">
              {data.listType === "place" && (
                <Hint label="View on map">
                  <IconButton
                    asChild
                    variant="outline"
                    size="sm"
                    aria-label="View on map"
                  >
                    <Link
                      href={`/map?tierLists=${data.id}`}
                      underline="none"
                      className="rounded-full"
                    >
                      <MapIcon />
                    </Link>
                  </IconButton>
                </Hint>
              )}
              {/* X17: a PRIVATE list's owner still gets Share, which says how
                  to make the list shareable (tierListShareBlock) instead of
                  handing out a link only they can open. */}
              {(data.privacy !== "PRIVATE" || data.isOwner) && (
                <Hint label="Share">
                  <IconButton
                    variant="outline"
                    size="sm"
                    aria-label="Share"
                    onClick={handleShare}
                  >
                    <Share />
                  </IconButton>
                </Hint>
              )}
              {data.isOwner && (
                <Hint label="Edit list">
                  <IconButton
                    asChild
                    variant="outline"
                    size="sm"
                    aria-label="Edit list"
                  >
                    <Link
                      href={`/tier-lists/${data.id}/edit`}
                      underline="none"
                      className="rounded-full"
                    >
                      <Edit />
                    </Link>
                  </IconButton>
                </Hint>
              )}
            </div>
          )}
        </div>
        {data.description && (
          <p className="type-callout text-ink-2">{data.description}</p>
        )}
        <div className="mt-1 flex min-h-11 items-center gap-2">
          <Badge variant="secondary" className="text-ink-2">
            <PrivacyIcon aria-hidden strokeWidth={ICON_STROKE} />
            {privacyInfo.label}
          </Badge>
          <span className="type-footnote tabular">
            {data.itemCount} {data.itemCount === 1 ? "item" : "items"}
          </span>
          {canArrange && !isArranging && !isEmpty && (
            <Button
              variant="secondary"
              className="ml-auto"
              onClick={() => {
                void setTab("rankings");
                setArranging(true);
              }}
            >
              <Arrange aria-hidden strokeWidth={ICON_STROKE} />
              Arrange
            </Button>
          )}
        </div>
      </div>

      {isArranging ? (
        <section aria-label="Arrange" className="flex flex-col gap-3 pb-2">
          <p className="type-footnote text-ink-2">
            Hold and drag a handle to move an entry; tap the minus to take it
            off the list. Undo reaches back through every change.
          </p>
          {board}
          {/* The app's ActionBar: sticky 12 pt above the tab bar on glass,
              in the thumb zone. In flow after the board, so the last row
              scrolls clear of it. Four controls share a phone's width: below
              400 px the two buttons drop their glyphs, and below 360 (a
              320 pt SE) "Add entry" reads "Add" and both tighten their
              padding — the accessible names never change. */}
          <ActionBar role="toolbar" aria-label="Arrange">
            <IconButton
              variant="ghost"
              aria-label={historyActionLabel("undo", history.undo)}
              disabled={!history.canUndo || stepping}
              onClick={() => void step("undo")}
            >
              <Undo />
            </IconButton>
            <IconButton
              variant="ghost"
              aria-label={historyActionLabel("redo", history.redo)}
              disabled={!history.canRedo || stepping}
              onClick={() => void step("redo")}
            >
              <Redo />
            </IconButton>
            <Button
              variant="secondary"
              aria-label="Add entry"
              className={ARRANGE_BUTTON}
              onClick={openAdd}
            >
              <Add aria-hidden strokeWidth={ICON_STROKE} />
              <span>
                Add<span className="max-[359px]:hidden"> entry</span>
              </span>
            </Button>
            <Button
              className={ARRANGE_BUTTON}
              onClick={() => setArranging(false)}
            >
              <Check aria-hidden strokeWidth={ICON_STROKE} />
              Done
            </Button>
          </ActionBar>
        </section>
      ) : (
        <Tabs
          value={tab}
          onValueChange={(v) => void setTab(v as typeof tab)}
          className="gap-3"
        >
          <TabsList className="h-11 w-full rounded-md bg-surface-2 p-1">
            <TabsTrigger value="rankings" className={TRIGGER}>
              Rankings
            </TabsTrigger>
            <TabsTrigger value="insights" className={TRIGGER}>
              Insights
            </TabsTrigger>
          </TabsList>
          <TabsContent value="rankings">{board}</TabsContent>
          <TabsContent value="insights">
            <TierListInsightsPanel
              insights={insightsData}
              tryNext={
                tryNextType === null ? null : { itemType: tryNextType, onList }
              }
              grounded={{ tierListId: data.id, isOwner: data.isOwner }}
            />
          </TabsContent>
        </Tabs>
      )}

      <AddEntryModal
        key={addSession}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(candidates) => void handleAdd(candidates)}
        busy={adding}
        error={addError}
        listType={data.listType}
        onList={onList}
        tierListId={data.id}
      />
    </div>
  );
}
