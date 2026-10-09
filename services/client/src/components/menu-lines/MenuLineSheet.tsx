"use client";

import { useRef } from "react";
import { useMutation, useQuery } from "urql";
import { BottomSheet } from "@/components/app/BottomSheet";
import {
  Add,
  Cellar,
  ChevronRight,
  Close,
  ICON_STROKE,
  Ranked,
  Recipe,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { notify } from "@/components/app/notify";
import { TypeChip, TypeGlyph } from "@/components/app/TypeChip";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { type MenuItemView, matchedItemHref } from "@/components/map/adapter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { WantToTryButton } from "@/components/want-to-try/WantToTryButton";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";
import { formatMenuPrice, menuLineText } from "@/utilities/menu-line-text";
import { displayItemName } from "@/utilities/smart-title-case";
import { MenuLineGlyph, MenuLineReasons } from "./MenuLineRow";
import {
  candidateQuery,
  lineItemType,
  MENU_GROUP_LABEL,
  menuGroupOf,
} from "./menu-lines";
import {
  MenuLineCandidatesQuery,
  VerifyMenuLineMatchMutation,
} from "./queries";

/** What the line sheet hands back to its list to open next. */
export type MenuLineAction = "log" | "cellar" | "tierList" | "addToCatalog";

export type MenuLinePlace = { readonly id: string; readonly name: string };

type MatchRef = { readonly id: string; readonly type: string };

/** `MenuItemMatchInput.type` is the lower-case `MenuItemType`. */
const matchInput = (match: MatchRef) => ({
  id: match.id,
  type: match.type.toLowerCase() as
    | "wine"
    | "beer"
    | "spirit"
    | "coffee"
    | "sake"
    | "tea",
});

/**
 * The scan owner's correction of a line's match — "Not this" (clear it) and
 * "That's it" (set a candidate) — with a toast that undoes it by setting
 * the previous match back. Both go through `verifyMenuItemMatch`, which
 * refuses anyone but the scan owner; the sheet only offers them to them.
 */
function useCorrectMatch(
  placeId: string,
  line: MenuItemView,
  onChanged?: () => void,
) {
  const [{ fetching }, verify] = useMutation(VerifyMenuLineMatchMutation);
  const set = async (match: MatchRef | null): Promise<boolean> => {
    const result = unwrapResult(
      (
        await verify({
          placeId,
          menuItemId: line.id,
          match: match === null ? null : matchInput(match),
        })
      ).data?.verifyMenuItemMatch,
      "PlaceMenuItem",
    );
    if (!result.ok) {
      notify("Couldn't change the match", {
        tone: "error",
        description: result.error.message,
      });
      return false;
    }
    onChanged?.();
    return true;
  };
  const change = async (
    next: MatchRef | null,
    message: string,
  ): Promise<void> => {
    const previous = line.matched_item;
    if (!(await set(next))) return;
    notify(message, {
      tone: "success",
      undo: () => {
        void (async () => {
          if (await set(previous)) notify("Match restored");
        })();
      },
    });
  };
  return { pending: fetching, change };
}

/** "Is it one of these?" — catalog rows for an unmatched line, in its type. */
function Candidates({
  line,
  type,
  placeId,
  canCorrect,
  onChanged,
}: {
  line: MenuItemView;
  type: ApiItemType;
  placeId: string;
  canCorrect: boolean;
  onChanged?: () => void;
}) {
  const [{ data, fetching, error: transportError }, retry] = useQuery({
    query: MenuLineCandidatesQuery,
    variables: { text: candidateQuery(line), itemTypes: [type] },
  });
  const { pending, change } = useCorrectMatch(placeId, line, onChanged);
  const result = data
    ? unwrapResult(data.itemSearch, "ItemSearchConnection")
    : null;
  // A search that failed is not a search that found nothing: saying "nothing
  // looks like this" after an error would be a claim the app cannot make.
  const failure =
    result !== null && !result.ok
      ? result.error.message
      : result === null && transportError !== undefined
        ? failureFromTransport(transportError).message
        : null;
  const candidates = result?.ok
    ? result.data.edges.map(({ node }) => ({
        id: node.id,
        type: node.type,
        name: displayItemName(node.name),
      }))
    : [];

  if (fetching && result === null) {
    return (
      <div aria-busy className="flex flex-col gap-2">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }
  if (failure !== null) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2">
        <p className="type-callout text-ink-2">
          Couldn&apos;t look this up in the catalog just now.
        </p>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => retry({ requestPolicy: "network-only" })}
        >
          Try again
        </Button>
      </div>
    );
  }
  if (candidates.length === 0) {
    return (
      <p className="type-callout text-ink-2">
        Nothing in the catalog looks like this yet.
      </p>
    );
  }
  return (
    <section
      aria-labelledby={`candidates-${line.id}`}
      className="flex flex-col gap-2"
    >
      <h3 id={`candidates-${line.id}`} className="type-overline text-ink-3">
        Is it one of these?
      </h3>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg bg-surface-2">
        {candidates.map((candidate) => {
          const href = matchedItemHref({
            id: candidate.id,
            type: candidate.type.toLowerCase(),
          });
          return (
            <li
              key={candidate.id}
              className="relative flex min-h-11 items-center gap-3 px-4 py-2"
            >
              <TypeGlyph type={candidate.type as ApiItemType} />
              <span className="type-body min-w-0 flex-1 truncate text-ink-1">
                {href !== null && !canCorrect ? (
                  <Link href={href} overlay underline="none">
                    {candidate.name}
                  </Link>
                ) : (
                  candidate.name
                )}
              </span>
              {canCorrect ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  aria-label={`That's it: ${candidate.name}`}
                  onClick={() =>
                    void change(
                      { id: candidate.id, type: candidate.type },
                      `Matched to ${candidate.name}`,
                    )
                  }
                >
                  That&apos;s it
                </Button>
              ) : (
                <ChevronRight aria-hidden className="size-4 text-ink-3" />
              )}
            </li>
          );
        })}
      </ul>
      {!canCorrect && (
        <p className="type-footnote">
          Only the person who scanned this menu can set its match — but you can
          open any of these.
        </p>
      )}
    </section>
  );
}

export type MenuLineSheetProps = {
  /** The line to act on; the sheet keeps the last one while it closes. */
  line: MenuItemView | null;
  place: MenuLinePlace;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** An action that opens a sheet of its own; the list closes this one first. */
  onAction: (action: MenuLineAction, line: MenuItemView) => void;
  /** After a change the server confirmed (a match set or cleared, a save). */
  onChanged?: () => void;
};

/**
 * Everything a menu line can do (X07), in one thumb-reachable sheet.
 *
 * A matched line: **I'm having this** (a drink log at this place, X02),
 * **Want to try**, **Add to tier list**, **Add to cellar** — and, for the
 * person who scanned the menu, **Not this**, which unlinks a wrong match.
 * An unmatched line: the catalog's nearest rows as a question ("Is it one of
 * these?") and **Add to catalog**, a draft the person confirms. A cocktail
 * matches recipes, not bottles, so it offers a recipe search instead.
 */
export function MenuLineSheet({
  line,
  place,
  open,
  onOpenChange,
  onAction,
  onChanged,
}: MenuLineSheetProps) {
  // Keep the last line while the sheet animates out, so it never goes blank.
  const last = useRef<MenuItemView | null>(line);
  if (line !== null) last.current = line;
  const current = line ?? last.current;
  const { pending, change } = useCorrectMatch(
    place.id,
    current ?? EMPTY_LINE,
    onChanged,
  );
  if (current === null) return null;

  const name = menuLineText(current.menu_item_name);
  const type = lineItemType(current);
  const group = menuGroupOf(current);
  const matched = current.matched_item;
  const href = matched ? matchedItemHref(matched) : null;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={name}
      description={
        [
          type === null ? MENU_GROUP_LABEL[group] : null,
          current.menu_item_price == null
            ? null
            : formatMenuPrice(current.menu_item_price),
          `at ${place.name}`,
        ]
          .filter(Boolean)
          .join(" · ") || undefined
      }
    >
      <div className="flex flex-col gap-5 pb-4">
        <div className="flex items-start gap-3">
          <MenuLineGlyph line={current} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {type !== null && <TypeChip type={type} />}
            {current.menu_item_description && (
              <p className="type-callout text-ink-2">
                {current.menu_item_description}
              </p>
            )}
          </div>
        </div>

        {matched && (
          <div className="relative flex min-h-11 items-center gap-3 rounded-lg bg-surface-2 px-4 py-2">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="type-footnote text-ink-3">Matched to</span>
              <span className="type-body truncate text-ink-1">
                {href ? (
                  <Link href={href} overlay underline="none">
                    {matched.name}
                  </Link>
                ) : (
                  matched.name
                )}
              </span>
            </span>
            {href && <ChevronRight aria-hidden className="size-4 text-ink-3" />}
          </div>
        )}

        <MenuLineReasons line={current} />

        {matched && type !== null && (
          <div className="flex flex-col gap-2">
            <Button size="lg" onClick={() => onAction("log", current)}>
              I&apos;m having this
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <WantToTryButton
                variant="button"
                target={{ kind: "ITEM", itemType: type, itemId: matched.id }}
                saved={matched.is_want_to_try}
                name={matched.name}
                onChange={() => onChanged?.()}
              />
              <Button
                variant="outline"
                onClick={() => onAction("cellar", current)}
              >
                <Cellar aria-hidden strokeWidth={ICON_STROKE} />
                Add to cellar
              </Button>
              <Button
                variant="outline"
                className="col-span-2"
                onClick={() => onAction("tierList", current)}
              >
                <Ranked aria-hidden strokeWidth={ICON_STROKE} />
                Add to tier list
              </Button>
            </div>
            {current.can_correct_match && (
              <Button
                variant="ghost"
                className="self-start text-ink-2"
                disabled={pending}
                aria-busy={pending || undefined}
                onClick={() =>
                  void change(null, `Unlinked ${matched.name} from this line`)
                }
              >
                {pending ? <Spinner aria-hidden /> : <Close aria-hidden />}
                Not this
              </Button>
            )}
          </div>
        )}

        {!matched && type !== null && (
          <>
            <Candidates
              line={current}
              type={type}
              placeId={place.id}
              canCorrect={current.can_correct_match}
              onChanged={onChanged}
            />
            <Button
              variant="outline"
              onClick={() => onAction("addToCatalog", current)}
            >
              <Add aria-hidden />
              Not listed? Add to catalog
            </Button>
          </>
        )}

        {!matched && type === null && group === "COCKTAIL" && (
          <div className="flex flex-col gap-2">
            <p className="type-callout text-ink-2">
              A cocktail is made, not bottled — find it among the recipes.
            </p>
            <Button variant="outline" asChild>
              <Link
                href={`/recipes?q=${encodeURIComponent(name)}`}
                underline="none"
              >
                <Recipe aria-hidden strokeWidth={ICON_STROKE} />
                Find a recipe
              </Link>
            </Button>
          </div>
        )}

        {!matched && type === null && group === "OTHER" && (
          <div className="flex flex-col gap-2">
            <p className="type-callout text-ink-2">
              The menu didn&apos;t say what kind of drink this is.
            </p>
            <Button
              variant="outline"
              onClick={() => onAction("addToCatalog", current)}
            >
              <Add aria-hidden />
              Add to catalog
            </Button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

/** A stand-in so the correction hook has a line before the first one. */
const EMPTY_LINE: MenuItemView = {
  id: "",
  menu_item_name: "",
  menu_item_description: null,
  menu_item_price: null,
  menu_category: null,
  detected_item_type: null,
  confidence_score: null,
  is_available: null,
  created_at: null,
  extracted_attributes: null,
  matched_item: null,
  search_name: null,
  can_correct_match: false,
  for_you: null,
};
