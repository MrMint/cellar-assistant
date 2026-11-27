"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useMutation } from "urql";
import { BottomSheet } from "@/components/app/BottomSheet";
import {
  Add,
  type AppIcon,
  Cellar,
  Delete,
  Edit,
  Lists,
  ShareOut,
  Star,
} from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { PRESS_CLASS, pressFeedback } from "@/components/app/overlays/press";
import { useNavigate } from "@/components/app/useNavigate";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { AddToTierListModal } from "@/components/tier-list/AddToTierListModal";
import type { TierListEntityType } from "@/components/tier-list/constants";
import { UpdateCellarItemMutation } from "@/lib/api/cellars";
import {
  AddItemReviewMutation,
  DeleteItemReviewMutation,
} from "@/lib/api/items";
import { feedback, HapticOverlay } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { AddToCellarSheet } from "../AddToCellarActions";
import { bottleHref } from "../adapter";
import { DeleteBottleDialog } from "../DeleteBottleDialog";
import { ItemShareSheet } from "../ItemShare";
import { addLabel, type ItemMenuAction, itemMenu } from "./item-menu";
import {
  canRemoveMyRating,
  type MoveTarget,
  type MyReview,
  moveBottle,
  moveTargets,
  removeMyRating,
} from "./item-writes";

const ICON = {
  list: Lists,
  add: Add,
  share: ShareOut,
  move: Cellar,
  edit: Edit,
  delete: Delete,
  removeRating: Star,
} as const satisfies Record<ItemMenuAction, AppIcon>;

/** The bottle the URL names, as the menu needs it. */
export type MenuBottle = {
  id: string;
  cellarId: string;
  isOwner: boolean;
  openAt: string | null;
  emptyAt: string | null;
  percentageRemaining: number;
};

export type ItemMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemType: ApiItemType;
  itemName: string;
  /** The creator's edit page (D7), or null. */
  editHref: string | null;
  /** Your cellars (and co-owned) that "Add" and "Move" may use. */
  addableCellars: readonly MoveTarget[];
  /** How many of your bottles of it the page holds. */
  held: number;
  selected: MenuBottle | null;
  myReview: MyReview | null;
};

function MenuRow({
  icon: Icon,
  label,
  destructive = false,
  onSelect,
  className,
}: {
  icon: AppIcon;
  label: string;
  destructive?: boolean;
  onSelect: () => void;
  className?: string;
}) {
  return (
    <li className={className}>
      <button
        type="button"
        {...pressFeedback()}
        onClick={() => {
          feedback("tick");
          onSelect();
        }}
        className={cn(
          "t-body relative flex min-h-13 w-full items-center gap-4 rounded-md px-1 text-left outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring",
          destructive ? "text-destructive" : "text-ink",
          PRESS_CLASS,
        )}
      >
        <Icon
          aria-hidden
          className={cn(
            "size-5 shrink-0",
            destructive ? "text-destructive" : "text-act-ink",
          )}
        />
        <span>{label}</span>
        <HapticOverlay />
      </button>
    </li>
  );
}

/**
 * The item's menu (Cellars-Pour's menu, CROSS-LOT): the rows `itemMenu`
 * allows, each opening its own sheet once this one has closed (two
 * overlapping vaul modals can leave `pointer-events: none` on body). Share
 * opens F2a's ShareSheet with the QR code; Remove my rating acts at once with
 * Undo (L7), and so does Move (MC-move).
 */
export function ItemMenu({
  open,
  onOpenChange,
  itemId,
  itemType,
  itemName,
  editHref,
  addableCellars,
  held,
  selected,
  myReview,
}: ItemMenuProps) {
  const router = useRouter();
  const navigate = useNavigate();
  const afterClose = useRef<ItemMenuAction | null>(null);
  const [sheet, setSheet] = useState<ItemMenuAction | null>(null);
  const [, deleteReview] = useMutation(DeleteItemReviewMutation);
  const [, addReview] = useMutation(AddItemReviewMutation);
  const [, updateBottle] = useMutation(UpdateCellarItemMutation);

  const ownedBottle = selected?.isOwner === true;
  const ownsBottle = held > 0 || ownedBottle;
  const targets =
    selected === null ? [] : moveTargets(addableCellars, selected.cellarId);
  const entries = itemMenu({
    addLabel: addLabel(addableCellars, held),
    editHref,
    ownedBottle,
    canMove: targets.length > 0,
    canRemoveRating: canRemoveMyRating({ myReview, ownsBottle }),
  });

  const removeRating = async () => {
    const result = await removeMyRating(
      { deleteReview, addReview },
      { itemId, type: itemType, myReview, ownsBottle },
    );
    if (!result.ok) {
      notify("Couldn’t remove your rating", {
        tone: "error",
        description: result.message,
      });
      return;
    }
    router.refresh();
    notify("Rating removed", {
      undo: () => {
        void result.undo().then((undone) => {
          if (!undone.ok) {
            notify("Couldn’t bring your rating back", {
              tone: "error",
              description: undone.message,
            });
          }
          router.refresh();
        });
      },
    });
  };

  const move = async (target: MoveTarget) => {
    if (selected === null) return;
    setSheet(null);
    const result = await moveBottle(updateBottle, {
      bottle: selected,
      to: target.id,
      targets,
    });
    if (!result.ok) {
      notify("Couldn’t move this bottle", {
        tone: "error",
        description: result.message,
      });
      return;
    }
    // The bottle's URL names its cellar: follow it there.
    navigate.replace(bottleHref(target.id, itemType, selected.id));
    notify(`Moved to ${target.name}`, {
      undo: () => {
        void result.undo().then((undone) => {
          if (!undone.ok) {
            notify("Couldn’t move it back", {
              tone: "error",
              description: undone.message,
            });
            return;
          }
          navigate.replace(
            bottleHref(selected.cellarId, itemType, selected.id),
          );
        });
      },
    });
  };

  const run = (action: ItemMenuAction) => {
    switch (action) {
      case "edit":
        if (editHref !== null) navigate.push(editHref);
        return;
      case "removeRating":
        void removeRating();
        return;
      default:
        setSheet(action);
    }
  };

  const close = (next: boolean) => {
    if (!next) setSheet(null);
  };
  const main = entries.filter((entry) => entry.last !== true);
  const last = entries.filter((entry) => entry.last === true);

  return (
    <>
      <BottomSheet
        open={open}
        onOpenChange={onOpenChange}
        onClosed={() => {
          const action = afterClose.current;
          afterClose.current = null;
          if (action !== null) run(action);
        }}
        title={itemName}
      >
        <ul data-testid="item-menu" className="flex flex-col pb-2">
          {[main, last].map((group, i) =>
            group.map((entry, j) => (
              <MenuRow
                key={entry.action}
                className={cn(
                  i === 1 && j === 0 && "mt-2 border-hair border-t pt-2",
                )}
                icon={ICON[entry.action]}
                label={entry.label}
                destructive={entry.destructive === true}
                onSelect={() => {
                  afterClose.current = entry.action;
                  onOpenChange(false);
                }}
              />
            )),
          )}
        </ul>
      </BottomSheet>

      <AddToCellarSheet
        open={sheet === "add"}
        onOpenChange={close}
        itemId={itemId}
        itemType={itemType}
        cellars={[...addableCellars]}
      />
      <AddToTierListModal
        open={sheet === "list"}
        onClose={() => setSheet(null)}
        entityId={itemId}
        entityType={itemType.toLowerCase() as TierListEntityType}
        entityName={itemName}
      />
      <ItemShareSheet
        open={sheet === "share"}
        onOpenChange={close}
        itemId={itemId}
        itemType={itemType}
        itemName={itemName}
      />
      {selected !== null && ownedBottle && (
        <>
          <DeleteBottleDialog
            open={sheet === "delete"}
            onOpenChange={close}
            itemType={itemType}
            itemName={itemName}
            cellarId={selected.cellarId}
            bottleId={selected.id}
            bottle={selected}
          />
          <BottomSheet
            open={sheet === "move"}
            onOpenChange={close}
            title="Move to"
            description="Its shelf spot clears; your logs stay."
          >
            <ul data-testid="move-targets" className="flex flex-col pb-2">
              {targets.map((target) => (
                <MenuRow
                  key={target.id}
                  icon={Cellar}
                  label={target.name}
                  onSelect={() => void move(target)}
                />
              ))}
            </ul>
          </BottomSheet>
        </>
      )}
    </>
  );
}
