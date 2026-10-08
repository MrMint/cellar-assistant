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
 * Undo. The old `isEditingLocked` flag is no longer read or written here.
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { type AddEntryCandidate, AddEntryModal } from "./AddEntryModal";
import { useTierListActions } from "./actions";
import { onListHrefs } from "./adapter";
import { BAND_LABELS } from "./constants";
import {
  bandForScore,
  historyActionLabel,
  historyStepMessage,
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
  const { addItemToTierListAction, undoAction, redoAction } =
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
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const { history, setHistory, markEdited } = useHistory(data.history);
  const [stepping, setStepping] = useState(false);
  const steppingRef = useRef(false);

  const canArrange = data.isOwner;
  const isArranging = canArrange && arranging;

  const openAdd = useCallback(() => {
    setAddError(null);
    setAddSession((session) => session + 1);
    setAddOpen(true);
  }, []);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/tier-lists/${data.id}`;
    const shareData = {
      title: data.name,
      text: `Check out my tier list: ${data.name}`,
      url,
    };

    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        notify("Link copied to clipboard", { tone: "success" });
      }
    } catch {
      // User cancelled share
    }
  }, [data.id, data.name]);

  /**
   * One step of the list's history. Its toast offers the opposite step, so
   * an Undo by mistake is itself one tap from being taken back.
   */
  const step = useCallback(
    async (direction: "undo" | "redo") => {
      if (steppingRef.current) return;
      steppingRef.current = true;
      setStepping(true);
      const result =
        direction === "undo"
          ? await undoAction(data.id)
          : await redoAction(data.id);
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
        undo: () => void step(opposite),
      });
      router.refresh();
    },
    [data.id, redoAction, router, setHistory, undoAction],
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

  const handleAddEntry = useCallback(
    async (candidate: AddEntryCandidate) => {
      setAdding(true);
      setAddError(null);
      const band = bandForScore(candidate.myScore);
      const result = await addItemToTierListAction(
        data.id,
        candidate.id,
        candidate.entityType,
        band,
      );
      setAdding(false);
      if (!result.success) {
        setAddError(result.error ?? "Failed to add item to tier list");
        return;
      }
      setAddOpen(false);
      markEdited();
      notify(`Added ${candidate.name} to ${BAND_LABELS[band]}`, {
        id: TIER_LIST_EDIT_TOAST,
        undo: () => void step("undo"),
      });
      router.refresh();
    },
    [addItemToTierListAction, data.id, markEdited, router, step],
  );

  const handleEdited = useCallback(() => markEdited(), [markEdited]);
  const handleUndo = useCallback(() => void step("undo"), [step]);

  const isEmpty = data.items.length === 0;

  const board = isEmpty ? (
    <EmptyState
      illustration={<Ranked aria-hidden strokeWidth={ICON_STROKE} />}
      title="Nothing ranked yet"
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
            Add entry
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
      {/* Header. Only the title shares its row with the actions: at 390 an
          owner of a place list has four of them, and a description in the
          title's column wrapped every two or three words. */}
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-4">
          <h1 className="type-title-1 min-w-0 flex-1 break-words text-ink-1">
            {data.name}
          </h1>
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
              {data.privacy !== "PRIVATE" && (
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
              scrolls clear of it. */}
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
            <Button variant="secondary" className="flex-1" onClick={openAdd}>
              <Add aria-hidden strokeWidth={ICON_STROKE} />
              Add entry
            </Button>
            <Button className="flex-1" onClick={() => setArranging(false)}>
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
            <TierListInsightsPanel insights={insightsData} />
          </TabsContent>
        </Tabs>
      )}

      <AddEntryModal
        key={addSession}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onPick={(candidate) => void handleAddEntry(candidate)}
        busy={adding}
        error={addError}
        listType={data.listType}
        onList={onList}
      />
    </div>
  );
}
