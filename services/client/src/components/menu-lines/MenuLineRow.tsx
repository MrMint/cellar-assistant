"use client";

import type { ReactNode } from "react";
import {
  type AppIcon,
  Cellar,
  Cocktail,
  Help,
  ICON_STROKE,
  People,
  Star,
  ThumbsUp,
  WantToTry,
} from "@/components/app/icons";
import { itemTypeTokens, TypeGlyph } from "@/components/app/TypeChip";
import type { MenuItemView } from "@/components/map/adapter";
import { cn } from "@/lib/utils";
import { formatMenuPrice, menuLineText } from "@/utilities/menu-line-text";
import {
  lineItemType,
  type MenuLineReasonKind,
  menuGroupOf,
  menuLineReasons,
} from "./menu-lines";

/**
 * A line's type mark: the six item types in their own hue and glyph, a
 * martini for a cocktail, a question mark for a line the read could not
 * place. Decorative — the group heading names the type in words.
 */
export function MenuLineGlyph({
  line,
  className,
}: {
  line: Pick<MenuItemView, "detected_item_type" | "matched_item">;
  className?: string;
}) {
  const type = lineItemType({
    id: "",
    menu_item_name: "",
    search_name: null,
    for_you: null,
    ...line,
  });
  const token = type === null ? null : itemTypeTokens[type];
  const Fallback =
    line.detected_item_type?.toLowerCase() === "cocktail" ? Cocktail : Help;
  return (
    <span
      data-slot="menu-line-glyph"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-md",
        token ? token.tintClass : "bg-surface-2",
        className,
      )}
    >
      {type !== null ? (
        <TypeGlyph type={type} className="size-5" />
      ) : (
        <Fallback
          aria-hidden
          strokeWidth={ICON_STROKE}
          className="size-5 text-ink-2"
        />
      )}
    </span>
  );
}

const REASON_ICON: Readonly<Record<MenuLineReasonKind, AppIcon>> = {
  cellar: Cellar,
  yourScore: Star,
  friends: People,
  like: ThumbsUp,
  wantToTry: WantToTry,
};

/**
 * The reasons a line matters to you, as quiet chips — facts in words, ink
 * on surface-2, never brass (they are not actions) and never teal (no AI
 * wrote them).
 */
export function MenuLineReasons({
  line,
  className,
}: {
  line: Parameters<typeof menuLineReasons>[0];
  className?: string;
}) {
  const reasons = menuLineReasons(line);
  if (reasons.length === 0) return null;
  return (
    <ul
      aria-label="Why it's for you"
      data-slot="menu-line-reasons"
      className={cn("flex flex-wrap gap-1.5", className)}
    >
      {reasons.map((reason) => {
        const Icon = REASON_ICON[reason.kind];
        return (
          <li
            key={reason.kind}
            data-reason={reason.kind}
            className="inline-flex min-h-6 max-w-full items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 type-footnote text-ink-1"
          >
            <Icon
              aria-hidden
              strokeWidth={ICON_STROKE}
              className="size-3.5 shrink-0 text-ink-2"
            />
            <span className="min-w-0">{reason.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

export type MenuLineRowProps = {
  line: MenuItemView;
  /**
   * What sits under the line. Omitted, the row says whether the line is
   * matched; the scan results page passes its own (Accept / Reject).
   */
  status?: ReactNode;
  /** Opens the line's actions; the whole row is the target. */
  onOpen?: () => void;
  className?: string;
};

/**
 * One menu line, the same on the place page and the scan results (X07): the
 * type mark, the line's own words cased for reading (`menuLineText`), the
 * price as the menu printed it, the description, then the reasons it is for
 * you. The row is one tap target (a stretched button) that opens the line's
 * actions; anything in `status` sits above it and keeps its own taps.
 */
export function MenuLineRow({
  line,
  status,
  onOpen,
  className,
}: MenuLineRowProps) {
  const name = menuLineText(line.menu_item_name);
  const matchedName = line.matched_item?.name ?? null;
  const showMatch =
    matchedName !== null &&
    matchedName.trim().toLowerCase() !== name.trim().toLowerCase();
  return (
    <li
      data-slot="menu-line"
      data-group={menuGroupOf(line)}
      data-matched={line.matched_item ? "" : undefined}
      className={cn(
        "relative flex gap-3 px-4 py-3 transition-colors duration-(--ca-dur-micro) has-[>button:active]:bg-surface-3",
        className,
      )}
    >
      {onOpen && (
        <button
          type="button"
          data-slot="menu-line-open"
          aria-haspopup="dialog"
          aria-label={`${name}${showMatch ? `, matched to ${matchedName}` : ""}`}
          onClick={onOpen}
          className="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
        />
      )}
      <MenuLineGlyph line={line} className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <p className="type-headline min-w-0 text-ink-1">{name}</p>
          {line.menu_item_price != null && (
            <p className="type-callout tabular shrink-0 font-semibold text-ink-1">
              {formatMenuPrice(line.menu_item_price)}
            </p>
          )}
        </div>
        {line.menu_item_description && (
          <p className="type-callout line-clamp-2 text-ink-2">
            {line.menu_item_description}
          </p>
        )}
        {showMatch && (
          <p className="type-footnote truncate text-ink-2">
            Matched to <span className="text-ink-1">{matchedName}</span>
          </p>
        )}
        <MenuLineReasons line={line} className="mt-1" />
        {status !== undefined ? (
          <div className="relative z-10 mt-1">{status}</div>
        ) : (
          !line.matched_item && (
            <p className="type-footnote text-ink-3">Not in the catalog yet</p>
          )
        )}
      </div>
    </li>
  );
}
