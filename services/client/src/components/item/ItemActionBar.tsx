"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ActionBar } from "@/components/app/ActionBar";
import { BottomSheet } from "@/components/app/BottomSheet";
import { IconButton } from "@/components/app/IconButton";
import { Delete, Edit, More, Ranked, Share } from "@/components/app/icons";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import type { PourBottle } from "@/components/pour/PourSheet";
import { AddToTierListModal } from "@/components/tier-list/AddToTierListModal";
import type { TierListEntityType } from "@/components/tier-list/constants";
import { Button } from "@/components/ui/button";
import { WantToTryButton } from "@/components/want-to-try/WantToTryButton";
import { cn } from "@/lib/utils";
import { AddToCellarSheet } from "./AddToCellarActions";
import { DeleteBottleDialog } from "./DeleteBottleDialog";
import { type ItemOverflowAction, itemOverflow } from "./header-actions";
import { useItemActions } from "./ItemActions";
import { useItemShare } from "./ItemShare";

const OVERFLOW_ICON = {
  tierList: Ranked,
  share: Share,
  edit: Edit,
  delete: Delete,
} as const satisfies Record<ItemOverflowAction, unknown>;

export type ItemActionBarProps = {
  itemId: string;
  itemType: ApiItemType;
  itemName: string;
  isWantToTry: boolean;
  /** The cellars "Add to cellar" offers (yours and co-owned). */
  addableCellars: { id: string; name: string }[];
  /** The creator's edit page, or null: "Edit item" in `⋯` (D7). */
  editHref: string | null;
  /**
   * The bottle the URL names, when it is yours and not finished: the primary
   * action is then X03's **Pour** from it (open + log + level), as the old
   * bottle page's ActionBar had it, rather than Log a drink.
   */
  pourable: PourBottle | null;
  /** The bottle the URL names, when the viewer may delete it. */
  deletable: {
    cellarId: string;
    bottleId: string;
    openAt: string | null;
    emptyAt: string | null;
    percentageRemaining: number;
  } | null;
};

/**
 * X09's ActionBar, 12 pt above the tab bar in the thumb zone (design §2):
 *
 *   [ Log a drink ] [ Add to cellar ] (Want to try) (⋯)
 *
 * **Log a drink** is the one brass action — the page's most frequent verb
 * (D27: Save · Log · Rate · Love) — and logs from the page's default bottle
 * (`ItemActionsProvider`). On the URL of a bottle of yours that is not
 * finished it is **Pour** instead (X03: the first pour opens a sealed
 * bottle, and every pour logs the drink); a plain log from that bottle is its
 * "Your bottles" row's Log. **Add to cellar** is the secondary one, left out
 * when the viewer has no cellar to add to. **Want to try** is X08's bookmark
 * (Save), and `⋯` opens a sheet of the rest: Add to tier list, Share, Edit
 * item (creator, D7) and Delete bottle (last, on a bottle's URL, for its
 * cellar's owner; a confirm behind it).
 *
 * The sheet's rows open their own modals only once the sheet has finished
 * closing (`onClosed`): two overlapping Radix/vaul modals can leave
 * `pointer-events: none` stuck on the body. Share is the exception — it
 * opens no modal of ours, and needs the tap's user activation.
 */
export function ItemActionBar({
  itemId,
  itemType,
  itemName,
  isWantToTry,
  addableCellars,
  editHref,
  pourable,
  deletable,
}: ItemActionBarProps) {
  const router = useRouter();
  const actions = useItemActions();
  const share = useItemShare({ itemId, itemType, itemName });
  const [moreOpen, setMoreOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [tierListOpen, setTierListOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const afterClose = useRef<ItemOverflowAction | null>(null);

  const entries = itemOverflow({ editHref, canDelete: deletable !== null });

  const run = (action: ItemOverflowAction) => {
    switch (action) {
      case "tierList":
        setTierListOpen(true);
        return;
      case "share":
        // Run from the tap itself (see the row's onClick); kept for
        // exhaustiveness.
        void share();
        return;
      case "edit":
        if (editHref !== null) router.push(editHref);
        return;
      case "delete":
        setDeleteOpen(true);
        return;
    }
  };

  // Tight at 375 pt: the two labelled buttons size to their words
  // (`flex-auto`, 12 pt sides) rather than splitting the bar in half, so
  // "Add to cellar" never clips beside "Log a drink".
  const labelled = "h-11 min-w-0 flex-auto px-3";

  return (
    <>
      <ActionBar
        aria-label="Item actions"
        role="toolbar"
        data-testid="item-action-bar"
      >
        {pourable !== null ? (
          <Button
            className={labelled}
            aria-haspopup="dialog"
            onClick={() => actions?.pour(pourable)}
            disabled={actions === null}
          >
            Pour
          </Button>
        ) : (
          <Button
            className={labelled}
            onClick={() => actions?.logDrink()}
            disabled={actions === null}
          >
            Log a drink
          </Button>
        )}
        {addableCellars.length > 0 && (
          <Button
            variant="secondary"
            className={labelled}
            onClick={() => setAddOpen(true)}
          >
            Add to cellar
          </Button>
        )}
        <WantToTryButton
          target={{ kind: "ITEM", itemType, itemId }}
          saved={isWantToTry}
          name={itemName}
          framed
          className="shrink-0"
        />
        <IconButton
          aria-label="More actions"
          aria-haspopup="dialog"
          variant="secondary"
          className="shrink-0"
          onClick={() => setMoreOpen(true)}
        >
          <More aria-hidden />
        </IconButton>
      </ActionBar>

      <BottomSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        onClosed={() => {
          const action = afterClose.current;
          afterClose.current = null;
          if (action !== null) run(action);
        }}
        title={itemName}
        description="More actions"
      >
        <div className="flex flex-col gap-1 pb-2">
          {entries.map((entry) => {
            const Icon = OVERFLOW_ICON[entry.action];
            return (
              <Button
                key={entry.action}
                variant="ghost"
                className={cn(
                  "h-12 justify-start",
                  entry.destructive && "text-destructive",
                )}
                onClick={() => {
                  // Share runs inside the tap: the system share sheet (and
                  // Safari's clipboard fallback) need the tap's user
                  // activation, which a sheet's closing animation can
                  // outlast. It opens no modal of ours, so it need not wait.
                  if (entry.action === "share") {
                    void share();
                  } else {
                    afterClose.current = entry.action;
                  }
                  setMoreOpen(false);
                }}
              >
                <Icon aria-hidden />
                {entry.label}
              </Button>
            );
          })}
        </div>
      </BottomSheet>

      <AddToCellarSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        itemId={itemId}
        itemType={itemType}
        cellars={addableCellars}
      />
      <AddToTierListModal
        open={tierListOpen}
        onClose={() => setTierListOpen(false)}
        entityId={itemId}
        entityType={itemType.toLowerCase() as TierListEntityType}
        entityName={itemName}
      />
      {deletable !== null && (
        <DeleteBottleDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          itemType={itemType}
          itemName={itemName}
          cellarId={deletable.cellarId}
          bottleId={deletable.bottleId}
          bottle={deletable}
        />
      )}
    </>
  );
}
