"use client";

import { useRef } from "react";
import { useMutation, useQuery } from "urql";
import { BottomSheet } from "@/components/app/BottomSheet";
import {
  Add,
  Cellar,
  ChevronRight,
  ICON_STROKE,
  Lists,
  Recipe,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { notify } from "@/components/app/notify";
import { TypeGlyph } from "@/components/app/TypeChip";
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
  recipeQuery,
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
        <p className="t-body text-ink-2">
          Couldn&apos;t look this up in the catalog just now.
        </p>
        <Button
          variant="outline"
          onClick={() => retry({ requestPolicy: "network-only" })}
        >
          Try again
        </Button>
      </div>
    );
  }
  if (candidates.length === 0) {
    return (
      <p className="t-body text-ink-2">
        Nothing in the catalog looks like this yet.
      </p>
    );
  }
  return (
    <section
      aria-labelledby={`candidates-${line.id}`}
      className="flex flex-col gap-2"
    >
      <h3 id={`candidates-${line.id}`} className="t-micro text-ink-2">
        Is it one of these?
      </h3>
      <ul className="flex flex-col divide-y divide-rule overflow-hidden rounded-lg border border-edge">
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
              <span className="t-body min-w-0 flex-1 truncate text-ink">
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
                  variant="outline"
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
                <ChevronRight aria-hidden className="size-4 text-glyph" />
              )}
            </li>
          );
        })}
      </ul>
      {!canCorrect && (
        <p className="t-cap text-ink-2">
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
 * **Want to try**, **Add to a list**, **Add to cellar** — and, for the
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

  const meta = [
    type === null ? MENU_GROUP_LABEL[group] : null,
    current.menu_item_description,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={name}
      hideTitle
      description={`at ${place.name}`}
    >
      <div className="flex flex-col gap-4 pb-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-3">
            <p aria-hidden className="t-title min-w-0 break-words text-ink">
              {name}
            </p>
            {current.menu_item_price != null && (
              <p className="t-head tabular shrink-0 pt-1 text-ink">
                {formatMenuPrice(current.menu_item_price)}
              </p>
            )}
          </div>
          {meta && <p className="t-cap text-ink-2">{meta}</p>}
        </div>

        {matched && (
          <section aria-label="Matched to" className="flex flex-col gap-2">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <h3 className="t-micro text-ink-2">Matched to</h3>
              {current.can_correct_match && (
                <Button
                  variant="quiet-muted"
                  className="min-w-11 px-0"
                  disabled={pending}
                  aria-busy={pending || undefined}
                  onClick={() => void change(null, `Unlinked ${matched.name}`)}
                >
                  {pending && <Spinner aria-hidden />}
                  Not this
                </Button>
              )}
            </div>
            <div className="relative flex min-h-14 items-center gap-3">
              <MenuLineGlyph line={current} className="size-14 rounded-lg" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="t-head truncate text-ink">
                  {href ? (
                    <Link href={href} overlay underline="none">
                      {matched.name}
                    </Link>
                  ) : (
                    matched.name
                  )}
                </span>
                {type !== null && (
                  <span className="t-cap text-ink-2">
                    {MENU_GROUP_LABEL[group]}
                  </span>
                )}
              </span>
              {href && (
                <ChevronRight aria-hidden className="size-5 text-glyph" />
              )}
            </div>
          </section>
        )}

        <MenuLineReasons line={current} />

        {matched && type !== null && (
          <div className="flex flex-col gap-2">
            <Button size="lg" onClick={() => onAction("log", current)}>
              I&apos;m having this
            </Button>
            <div className="grid grid-cols-3 gap-2">
              <WantToTryButton
                variant="button"
                target={{ kind: "ITEM", itemType: type, itemId: matched.id }}
                saved={matched.is_want_to_try}
                name={matched.name}
                className="h-auto min-h-16 flex-col gap-1 px-1 py-2"
                onChange={() => onChanged?.()}
              />
              <Button
                variant="outline"
                className="h-auto min-h-16 flex-col gap-1 px-1 py-2"
                onClick={() => onAction("cellar", current)}
              >
                <Cellar aria-hidden strokeWidth={ICON_STROKE} />
                Add to cellar
              </Button>
              <Button
                variant="outline"
                className="h-auto min-h-16 flex-col gap-1 px-1 py-2"
                onClick={() => onAction("tierList", current)}
              >
                <Lists aria-hidden strokeWidth={ICON_STROKE} />
                Add to a list
              </Button>
            </div>
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
            <p className="t-body text-ink-2">
              A cocktail is made, not bottled — find it among the recipes.
            </p>
            <Button variant="outline" asChild>
              <Link
                href={`/recipes?q=${encodeURIComponent(recipeQuery(current))}`}
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
            <p className="t-body text-ink-2">
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
