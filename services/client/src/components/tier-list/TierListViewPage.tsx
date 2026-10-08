"use client";

/**
 * `82450ad1:src/components/tier-list/TierListViewPage.tsx`, restored: header
 * (name, description, privacy chip, count), the map / share / lock / edit
 * icon buttons, and the URL-backed Rankings / Insights tabs (`?tab=`, with
 * `?item=` scrolling to an entry).
 *
 * Kept from the rewrite (decision 2, new-only, listed for the user): an
 * **Add entry** icon button for the owner of an unlocked list, opening
 * `AddEntryModal` — the old page had no in-page add (entries came from the
 * item and place pages' "Add to Tier List"). A new entry lands in Unrated,
 * as the old modal's did.
 *
 * On the app's primitives (D20): `IconButton`s named by their old tooltips,
 * Radix tabs, `notify` toasts in place of the Snackbar.
 */

import { useRouter } from "next/navigation";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { IconButton } from "@/components/app/IconButton";
import {
  Add,
  type AppIcon,
  Edit,
  ICON_STROKE,
  Lock,
  MapIcon,
  People,
  Public,
  Share,
  Unlock,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { notify } from "@/components/app/notify";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { absoluteUrl, canonicalPath } from "@/lib/share/routes";
import { tierListShareBlock } from "@/lib/share/share-rules";
import { useShareLink } from "@/lib/share/use-share-link";
import { cn } from "@/lib/utils";
import { type AddEntryCandidate, AddEntryModal } from "./AddEntryModal";
import { useTierListActions } from "./actions";
import { onListHrefs } from "./adapter";
import { TierListInsightsPanel } from "./insights/TierListInsightsPanel";
import { TierListView } from "./TierListView";
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
  const { setTierListEditingLockAction, addItemToTierListAction } =
    useTierListActions();
  const [addOpen, setAddOpen] = useState(false);
  /**
   * Bumped on every open and used as the picker's `key`, so each open starts
   * from an empty search: a reopened picker showing the last query's rows
   * reads as fresh results, and offered "Add" on what was just added.
   */
  const [addSession, setAddSession] = useState(0);
  const onList = useMemo(() => onListHrefs(data.items), [data.items]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [isEditingLocked, setIsEditingLocked] = useState(data.isEditingLocked);
  const [isSavingEditingLock, setIsSavingEditingLock] = useState(false);

  useEffect(() => {
    setIsEditingLocked(data.isEditingLocked);
  }, [data.isEditingLocked]);

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

  const handleToggleEditingLock = useCallback(async () => {
    if (!data.isOwner || isSavingEditingLock) return;

    const previousLocked = isEditingLocked;
    const nextLocked = !previousLocked;

    setIsEditingLocked(nextLocked);
    setIsSavingEditingLock(true);

    const result = await setTierListEditingLockAction(data.id, nextLocked);
    setIsSavingEditingLock(false);

    if (!result.success) {
      setIsEditingLocked(previousLocked);
      notify(result.error ?? "Failed to update editing lock", {
        tone: "error",
      });
      return;
    }

    setIsEditingLocked(result.isEditingLocked ?? nextLocked);
    notify(nextLocked ? "Editing locked" : "Editing unlocked", {
      tone: "success",
    });
  }, [
    data.id,
    data.isOwner,
    isEditingLocked,
    isSavingEditingLock,
    setTierListEditingLockAction,
  ]);

  const handleAddEntry = useCallback(
    async (candidate: AddEntryCandidate) => {
      setAdding(true);
      setAddError(null);
      const result = await addItemToTierListAction(
        data.id,
        candidate.id,
        candidate.entityType,
        0,
      );
      setAdding(false);
      if (!result.success) {
        setAddError(result.error ?? "Failed to add item to tier list");
        return;
      }
      setAddOpen(false);
      notify(`Added ${candidate.name} to Unrated`, { tone: "success" });
      router.refresh();
    },
    [addItemToTierListAction, data.id, router],
  );

  const lockLabel = isEditingLocked ? "Unlock editing" : "Lock editing";

  return (
    <div className="mx-auto flex w-full max-w-[800px] flex-col gap-4 sm:px-4">
      {/* Header. Only the title shares its row with the actions: at 390 an
          owner of a place list has five of them, and a description in the
          title's column wrapped every two or three words. */}
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-4">
          <h1 className="type-title-1 min-w-0 flex-1 break-words text-ink-1">
            {data.name}
          </h1>
          <div className="flex shrink-0 gap-1">
            {data.isOwner && !isEditingLocked && (
              <Hint label="Add entry">
                <IconButton
                  variant="outline"
                  size="sm"
                  aria-label="Add entry"
                  onClick={() => {
                    setAddError(null);
                    setAddSession((session) => session + 1);
                    setAddOpen(true);
                  }}
                >
                  <Add />
                </IconButton>
              </Hint>
            )}
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
              <Hint label={lockLabel}>
                <IconButton
                  variant={isEditingLocked ? "secondary" : "outline"}
                  size="sm"
                  // The name says what a press does ("Unlock editing"), as the
                  // tooltip does; no aria-pressed beside it, or a screen reader
                  // hears "Unlock editing, pressed" and the two contradict.
                  aria-label={lockLabel}
                  className={cn(isEditingLocked && "text-ink-1")}
                  onClick={handleToggleEditingLock}
                  disabled={isSavingEditingLock}
                >
                  {isEditingLocked ? <Lock /> : <Unlock />}
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
        </div>
        {data.description && (
          <p className="type-callout text-ink-2">{data.description}</p>
        )}
        <div className="mt-1 flex items-center gap-2">
          <Badge variant="secondary" className="text-ink-2">
            <PrivacyIcon aria-hidden strokeWidth={ICON_STROKE} />
            {privacyInfo.label}
          </Badge>
          <span className="type-footnote tabular">
            {data.itemCount} {data.itemCount === 1 ? "item" : "items"}
          </span>
        </div>
      </div>

      {/* Tabs: Rankings + Insights */}
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
        <TabsContent value="rankings">
          <TierListView
            tierListId={data.id}
            items={data.items}
            isOwner={data.isOwner}
            isEditingLocked={isEditingLocked}
            selectedItemId={selectedItemId ?? undefined}
          />
        </TabsContent>
        <TabsContent value="insights">
          <TierListInsightsPanel insights={insightsData} />
        </TabsContent>
      </Tabs>

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
