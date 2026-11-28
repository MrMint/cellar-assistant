"use client";

import type { ReactNode } from "react";
import {
  type AppIcon,
  Cellar,
  Check,
  Cocktail,
  Help,
  ICON_STROKE,
  People,
  Star,
  WantToTry,
} from "@/components/app/icons";
import { itemTypeTokens, TypeGlyph } from "@/components/app/TypeChip";
import type { MenuItemView } from "@/components/map/adapter";
import { feedback } from "@/lib/feedback";
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
  like: Star,
  wantToTry: WantToTry,
};

/** The owner's own verdicts wear gold (CROSS-LOT 1); every other reason is ink-2. */
const OWNER_REASON: ReadonlySet<MenuLineReasonKind> =
  new Set<MenuLineReasonKind>(["yourScore", "like"]);

/**
 * One quiet line under a menu line: a glyph and a few words. The reason a
 * line matters to you, the match, or what is still open about it.
 */
export function MenuLineNote({
  icon: Icon,
  gold = false,
  className,
  children,
}: {
  icon: AppIcon;
  gold?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      data-slot="menu-line-note"
      className={cn(
        "t-cap flex min-w-0 items-center gap-1.5 text-ink-2",
        className,
      )}
    >
      <Icon
        aria-hidden
        strokeWidth={ICON_STROKE}
        className={cn(
          "size-3.5 shrink-0",
          gold ? "fill-gold text-gold" : "text-glyph",
        )}
      />
      <span className="min-w-0 truncate">{children}</span>
    </p>
  );
}

/**
 * The reasons a line matters to you, as glyph lines — facts in words, never
 * teal (no AI wrote them). `limit` keeps a row to its strongest one.
 */
export function MenuLineReasons({
  line,
  limit,
  className,
}: {
  line: Parameters<typeof menuLineReasons>[0];
  limit?: number;
  className?: string;
}) {
  const reasons = menuLineReasons(line).slice(0, limit);
  if (reasons.length === 0) return null;
  return (
    <ul
      aria-label="Why it's for you"
      data-slot="menu-line-reasons"
      className={cn("flex flex-col gap-1", className)}
    >
      {reasons.map((reason) => (
        <li key={reason.kind} data-reason={reason.kind}>
          <MenuLineNote
            icon={REASON_ICON[reason.kind]}
            gold={OWNER_REASON.has(reason.kind)}
          >
            {reason.label}
          </MenuLineNote>
        </li>
      ))}
    </ul>
  );
}

export type MenuLineRowProps = {
  line: MenuItemView;
  /**
   * What sits under the line. Omitted, the row says its strongest reason, its
   * match, or that it is not in the catalog; the scan results page passes its
   * own (the suggestion with Not this / That's it).
   */
  status?: ReactNode;
  /** Opens the line's actions; the whole row is the target. */
  onOpen?: () => void;
  className?: string;
};

/**
 * One menu line, the same on the place page and the scan results
 * (Places-Menus 03, Places-Place 22): the line's own words cased for reading
 * (`menuLineText`) with the price as the menu printed it, the description as
 * its meta line, then one quiet note. The row is one tap target (a stretched
 * button) that opens the line's actions; anything in `status` sits above it
 * and keeps its own taps.
 */
export function MenuLineRow({
  line,
  status,
  onOpen,
  className,
}: MenuLineRowProps) {
  const name = menuLineText(line.menu_item_name);
  const matchedName = line.matched_item?.name ?? null;
  const sameName =
    matchedName !== null &&
    matchedName.trim().toLowerCase() === name.trim().toLowerCase();
  const hasReason = menuLineReasons(line).length > 0;
  return (
    <li
      data-slot="menu-line"
      data-group={menuGroupOf(line)}
      data-matched={line.matched_item ? "" : undefined}
      className={cn(
        "relative flex flex-col gap-1 border-rule border-b py-3 transition-colors duration-(--ca-dur-micro) last:border-b-0 has-[>button:active]:bg-surface-2",
        className,
      )}
    >
      {onOpen && (
        <button
          type="button"
          data-slot="menu-line-open"
          aria-haspopup="dialog"
          aria-label={`${name}${matchedName !== null && !sameName ? `, matched to ${matchedName}` : ""}`}
          onClick={() => {
            feedback("press");
            onOpen();
          }}
          className="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
        />
      )}
      <div className="flex items-start justify-between gap-3">
        <p className="t-head min-w-0 break-words text-ink">{name}</p>
        {line.menu_item_price != null && (
          <p className="t-head tabular shrink-0 text-ink">
            {formatMenuPrice(line.menu_item_price)}
          </p>
        )}
      </div>
      {line.menu_item_description && (
        <p className="t-cap line-clamp-2 break-words text-ink-2">
          {line.menu_item_description}
        </p>
      )}
      {status !== undefined ? (
        <div className="relative z-10 mt-0.5">{status}</div>
      ) : hasReason ? (
        <MenuLineReasons line={line} limit={1} className="mt-0.5" />
      ) : matchedName !== null && !sameName ? (
        <MenuLineNote icon={Check} className="mt-0.5">
          <span className="sr-only">Matched to </span>
          {matchedName}
        </MenuLineNote>
      ) : (
        !line.matched_item && (
          <MenuLineNote icon={Help} className="mt-0.5">
            Not in the catalog yet
          </MenuLineNote>
        )
      )}
    </li>
  );
}
