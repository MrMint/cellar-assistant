"use client";

import { type ReactNode, useMemo, useRef, useState } from "react";
import { useQuery } from "urql";
import { LogDrinkSheet } from "@/components/drink-log/LogDrinkSheet";
import { useDrinkLogFeedback } from "@/components/drink-log/useDrinkLogFeedback";
import { AddToCellarSheet } from "@/components/item/AddToCellarActions";
import type { MenuItemView } from "@/components/map/adapter";
import { AddToTierListModal } from "@/components/tier-list/AddToTierListModal";
import type { TierListEntityType } from "@/components/tier-list/constants";
import { unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import { MenuLineDraftSheet } from "./MenuLineDraftSheet";
import { MenuLineRow } from "./MenuLineRow";
import {
  type MenuLineAction,
  type MenuLinePlace,
  MenuLineSheet,
} from "./MenuLineSheet";
import { groupMenuLines, lineItemType } from "./menu-lines";
import { MenuLineCellarsQuery } from "./queries";

type OpenSheet = "line" | MenuLineAction;

export type MenuLineListProps = {
  lines: readonly MenuItemView[];
  /**
   * The place the menu is from. Without one (a scan that was never filed on
   * a place) the lines are shown but offer no actions: a log, a match and a
   * cellar source all hang off the place.
   */
  place: MenuLinePlace | null;
  /** The scan page's own status row under each line (Accept / Reject). */
  renderStatus?: (line: MenuItemView) => ReactNode;
  /** After any change the server confirmed: re-read the lines. */
  onChanged?: () => void;
  className?: string;
};

/**
 * A menu, as lines grouped by type (X07) — the one list the place page, the
 * map drawer and the scan results all draw. Tapping a line opens its sheet
 * (`MenuLineSheet`); an action there that needs a sheet of its own (the log,
 * the cellar, the tier list, the draft) closes the line's and opens that one,
 * so sheets never stack.
 */
export function MenuLineList({
  lines,
  place,
  renderStatus,
  onChanged,
  className,
}: MenuLineListProps) {
  const groups = useMemo(() => groupMenuLines(lines), [lines]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  // The line stays known while a sheet closes, and follows a re-read.
  const last = useRef<MenuItemView | null>(null);
  const fresh = lines.find((line) => line.id === selectedId) ?? null;
  if (fresh !== null) last.current = fresh;
  const selected = fresh ?? last.current;

  const matched = selected?.matched_item ?? null;
  const type = selected === null ? null : lineItemType(selected);
  const itemName = matched?.name ?? "";

  const [{ data: cellarData }] = useQuery({
    query: MenuLineCellarsQuery,
    pause: sheet !== "cellar",
  });
  const cellarResult = cellarData
    ? unwrapResult(cellarData.myCellars, "CellarConnection")
    : null;
  const cellars =
    cellarResult === null
      ? undefined
      : cellarResult.ok
        ? cellarResult.data.edges.map(({ node }) => ({
            id: node.id,
            name: node.name,
          }))
        : [];

  const onLogged = useDrinkLogFeedback({ itemName, onChanged });

  const close = (which: OpenSheet) => (open: boolean) => {
    if (!open && sheet === which) setSheet(null);
  };

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {groups.map((group) => (
        <section
          key={group.key}
          aria-labelledby={`menu-group-${group.key}`}
          data-slot="menu-group"
          data-group={group.key}
          className="flex flex-col gap-2"
        >
          <h3
            id={`menu-group-${group.key}`}
            className="flex items-baseline justify-between gap-2 px-4 type-overline text-ink-3"
          >
            {group.label}
            <span className="tabular">{group.lines.length}</span>
          </h3>
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg bg-surface-1">
            {group.lines.map((line) => (
              <MenuLineRow
                key={line.id}
                line={line}
                status={renderStatus?.(line)}
                onOpen={
                  place === null
                    ? undefined
                    : () => {
                        setSelectedId(line.id);
                        setSheet("line");
                      }
                }
              />
            ))}
          </ul>
        </section>
      ))}

      {place !== null && (
        <>
          <MenuLineSheet
            line={sheet === "line" ? selected : null}
            place={place}
            open={sheet === "line"}
            onOpenChange={close("line")}
            onAction={(action, line) => {
              setSelectedId(line.id);
              setSheet(action);
            }}
            onChanged={onChanged}
          />
          {matched !== null && type !== null && (
            <>
              <LogDrinkSheet
                open={sheet === "log"}
                onOpenChange={close("log")}
                subject={{ itemType: type, itemId: matched.id, itemName }}
                defaultPlace={{ id: place.id, name: place.name }}
                onSaved={onLogged}
              />
              <AddToCellarSheet
                open={sheet === "cellar"}
                onOpenChange={close("cellar")}
                itemId={matched.id}
                itemType={type}
                cellars={cellars}
                source={
                  selected === null
                    ? undefined
                    : { placeId: place.id, menuItemId: selected.id }
                }
              />
              <AddToTierListModal
                open={sheet === "tierList"}
                onClose={() => setSheet(null)}
                entityId={matched.id}
                entityType={type.toLowerCase() as TierListEntityType}
                entityName={itemName}
              />
            </>
          )}
          <MenuLineDraftSheet
            line={sheet === "addToCatalog" ? selected : null}
            placeId={place.id}
            open={sheet === "addToCatalog"}
            onOpenChange={close("addToCatalog")}
            onChanged={onChanged}
          />
        </>
      )}
    </div>
  );
}
