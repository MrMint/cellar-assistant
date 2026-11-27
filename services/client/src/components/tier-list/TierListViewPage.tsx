"use client";

/**
 * The tier list page (screens/Tier-list, DECISIONS 37–41): the name, its
 * privacy and count, the Rankings / Insights segments (`?tab=`, with
 * `?item=` scrolling to an entry) beside Map (a place list: `/map?list=`,
 * L40), Share and Details, and under Rankings the search, the Arrange sheet
 * (Ranking or the crowd's rating, and Show only), the board, and the
 * thumb-zone dock: Edit order and the one primary, Add.
 *
 * Edit order is the lock (DECISIONS 41): the board is read-only until the
 * owner opens it, and then the board's own dock moves the picked row and
 * carries this page's Undo and Redo, which step the list's server-side
 * history (`TierList.editHistory`); every edit's toast offers the same Undo.
 * A new entry lands in the band your own rating puts it in (`bandForScore`).
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
import { BottomSheet } from "@/components/app/BottomSheet";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterChip } from "@/components/app/FilterChip";
import { IconButton } from "@/components/app/IconButton";
import {
  Add,
  type AppIcon,
  Arrange,
  Edit,
  ICON_STROKE,
  Lock,
  MapIcon,
  People,
  Public,
  Ranked,
  Redo,
  Search,
  Share,
  SortDescending,
  Undo,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { notify } from "@/components/app/notify";
import { MorphTitle } from "@/components/app/RouteTransition";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { ListShareSheet } from "@/components/share/ListShareSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { feedback } from "@/lib/feedback";
import { type AddEntryCandidate, AddEntryModal } from "./AddEntryModal";
import { useTierListActions } from "./actions";
import { itemTypeOfList, onListHrefs } from "./adapter";
import { addedMessage } from "./add-entry";
import { BAND_LABELS, entryNoun } from "./constants";
import {
  bandForScore,
  historyActionLabel,
  historyStepMessage,
  stepSeq,
  type TierListHistoryView,
} from "./history";
import { TierListInsightsPanel } from "./insights/TierListInsightsPanel";
import { ListDetailsSheet } from "./lists/ListSheets";
import {
  type BoardOrder,
  TIER_LIST_EDIT_TOAST,
  TierListView,
} from "./TierListView";
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
  "t-head h-full rounded-sm text-ink-2 data-[state=active]:bg-card data-[state=active]:text-ink";

/** Show only offers the ranked bands, best first. */
const RANKED_BANDS = [5, 4, 3, 2, 1] as const;

/**
 * How long an Undo tapped right after an edit on this page waits for the
 * refreshed history to name that edit (`markEdited` cannot know its seq),
 * and how often it looks. The refresh is a few hundred ms; past this the
 * tap says so instead of stepping blind.
 */
const STEP_SEQ_WAIT_MS = 4000;
const STEP_SEQ_POLL_MS = 100;

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
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<ReadonlySet<number>>(() => new Set());
  const [order, setOrder] = useState<BoardOrder>("rank");
  const [sortOpen, setSortOpen] = useState(false);
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

  // F-22 / H-33: Share and Details are L2's sheets, on this page. The share
  // sheet says who can open the link and lets the owner change it (X17's
  // PRIVATE case included), so nothing is copied before the person sees that.
  const [shareOpen, setShareOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

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
  const noun = (count: number) => entryNoun(data.listType, count);
  const bandCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const item of data.items)
      counts[item.band] = (counts[item.band] ?? 0) + 1;
    return counts;
  }, [data.items]);
  const toggleOnly = (band: number) =>
    setOnly((current) => {
      const next = new Set(current);
      if (next.has(band)) next.delete(band);
      else next.add(band);
      return next;
    });
  const narrowed = only.size > 0 || order === "crowd";

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
        data.isOwner ? (
          <Button onClick={openAdd}>
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
      listName={data.name}
      listType={data.listType}
      arranging={isArranging}
      selectedItemId={selectedItemId ?? undefined}
      query={query}
      only={only}
      order={order}
      onClearSearch={() => {
        setQuery("");
        setOnly(new Set());
      }}
      onEdited={handleEdited}
      onUndo={handleUndo}
      onDone={() => setArranging(false)}
      arrangeTools={
        <>
          <IconButton
            aria-label={historyActionLabel("undo", history.undo)}
            disabled={!history.canUndo || stepping}
            onClick={() => void step("undo")}
          >
            <Undo />
          </IconButton>
          <IconButton
            aria-label={historyActionLabel("redo", history.redo)}
            disabled={!history.canRedo || stepping}
            onClick={() => void step("redo")}
          >
            <Redo />
          </IconButton>
          <IconButton aria-label="Add entry" onClick={openAdd}>
            <Add />
          </IconButton>
        </>
      }
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-[800px] flex-col gap-4 sm:px-4">
      {/* W-10: Back, like every other pushed page; the large title below
          stays the page's h1 (and the morph target), so the bar has none. */}
      <AppBar parent="/tier-lists" />
      <header className="flex flex-col gap-1">
        {/* B05: the target of TierListCard's title morph (H-7). */}
        <MorphTitle>
          <h1 className="t-title m-0 min-w-0 break-words text-ink">
            {data.name}
          </h1>
        </MorphTitle>
        <p className="t-cap tabular m-0 flex items-center gap-1 text-ink-2">
          <PrivacyIcon
            aria-hidden
            strokeWidth={ICON_STROKE}
            className="size-4"
          />
          <span>{privacyInfo.label}</span>
          <span aria-hidden>·</span>
          <span>
            {data.itemCount} {noun(data.itemCount)}
          </span>
        </p>
        {data.description && (
          <p className="t-body m-0 text-ink-2">{data.description}</p>
        )}
      </header>

      {isArranging ? (
        <section aria-label="Arrange" className="flex flex-col gap-3 pb-2">
          <p className="t-cap m-0 text-ink-2">
            Tap a row, then move it; or hold its handle and drag. Undo reaches
            back through every change.
          </p>
          {board}
        </section>
      ) : (
        <Tabs
          value={tab}
          onValueChange={(v) => {
            feedback("tick");
            void setTab(v as typeof tab);
          }}
          className="gap-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <TabsList className="h-11 min-w-0 flex-1 rounded-md bg-raised p-1">
              <TabsTrigger value="rankings" className={TRIGGER}>
                Rankings
              </TabsTrigger>
              <TabsTrigger value="insights" className={TRIGGER}>
                Insights
              </TabsTrigger>
            </TabsList>
            <div className="flex shrink-0 gap-1">
              {/* L40: a place list opens on the map, filtered to it. */}
              {data.listType === "place" && (
                <Hint label="Map">
                  <IconButton asChild variant="outline" aria-label="Map">
                    <Link
                      href={`/map?list=${encodeURIComponent(data.id)}`}
                      underline="none"
                      onClick={() => feedback("press")}
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
                    aria-label="Share"
                    onClick={() => {
                      feedback("press");
                      setShareOpen(true);
                    }}
                  >
                    <Share />
                  </IconButton>
                </Hint>
              )}
              {data.isOwner && (
                <Hint label="Details">
                  <IconButton
                    variant="outline"
                    aria-label="Details"
                    onClick={() => {
                      feedback("press");
                      setDetailsOpen(true);
                    }}
                  >
                    <Edit />
                  </IconButton>
                </Hint>
              )}
            </div>
          </div>
          <TabsContent value="rankings" className="flex flex-col gap-3">
            {!isEmpty && (
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search
                    aria-hidden
                    strokeWidth={ICON_STROKE}
                    className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-glyph"
                  />
                  <Input
                    type="search"
                    aria-label="Search this list"
                    value={query}
                    placeholder="Search this list"
                    onChange={(event) => setQuery(event.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button
                  variant="outline"
                  aria-label={`Arrange: ${order === "crowd" ? "Crowd's rating" : "Ranking"}${only.size > 0 ? `, ${only.size} bands` : ""}`}
                  aria-pressed={narrowed}
                  onClick={() => setSortOpen(true)}
                >
                  <SortDescending aria-hidden strokeWidth={ICON_STROKE} />
                  {order === "crowd" ? "Crowd" : "Rank"}
                </Button>
              </div>
            )}
            {board}
            {/* The thumb-zone dock: Edit order (the lock, DECISIONS 41) and
                the one primary, Add. */}
            {canArrange && (
              <ActionBar>
                {!isEmpty && (
                  <Button
                    variant="outline"
                    className="min-w-0 flex-1"
                    onClick={() => {
                      void setTab("rankings");
                      setArranging(true);
                    }}
                  >
                    <Arrange aria-hidden strokeWidth={ICON_STROKE} />
                    Edit order
                  </Button>
                )}
                <Button className="min-w-0 flex-1" onClick={openAdd}>
                  <Add aria-hidden strokeWidth={ICON_STROKE} />
                  Add a {noun(1)}
                </Button>
              </ActionBar>
            )}
          </TabsContent>
          <TabsContent value="insights">
            <TierListInsightsPanel
              insights={insightsData}
              tryNext={
                tryNextType === null ? null : { itemType: tryNextType, onList }
              }
              grounded={{ tierListId: data.id, isOwner: data.isOwner }}
              noun={noun(2)}
            />
          </TabsContent>
        </Tabs>
      )}

      <BottomSheet open={sortOpen} onOpenChange={setSortOpen} title="Arrange">
        <div className="flex flex-col gap-4 pb-2">
          <SegmentedControl
            aria-label="Order"
            options={[
              { value: "rank", label: "Ranking" },
              { value: "crowd", label: "Crowd's rating" },
            ]}
            value={order}
            onValueChange={setOrder}
          />
          <div className="flex flex-col gap-2">
            <h3 className="t-head m-0 text-ink">Show only</h3>
            <div className="flex flex-wrap gap-2">
              {RANKED_BANDS.map((band) => (
                <FilterChip
                  key={band}
                  selected={only.has(band)}
                  count={bandCounts[band] ?? 0}
                  onClick={() => toggleOnly(band)}
                >
                  {BAND_LABELS[band]}
                </FilterChip>
              ))}
            </div>
          </div>
        </div>
      </BottomSheet>

      {(data.privacy !== "PRIVATE" || data.isOwner) && (
        <ListShareSheet
          open={shareOpen}
          onOpenChange={setShareOpen}
          tierListId={data.id}
          name={data.name}
          privacy={data.privacy}
        />
      )}
      {data.isOwner && (
        <ListDetailsSheet
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          tierList={data}
          viewerId={data.createdById}
        />
      )}

      <AddEntryModal
        key={addSession}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(candidates) => void handleAdd(candidates)}
        busy={adding}
        error={addError}
        listType={data.listType}
        listName={data.name}
        onList={onList}
        tierListId={data.id}
      />
    </div>
  );
}
