"use client";

import { IconButton } from "@/components/app/IconButton";
import { Close, ICON_STROKE } from "@/components/app/icons";
import { previousPathOutside } from "@/components/app/nav-history";
import { expectPop } from "@/components/app/RouteTransition";
import { useNavigate } from "@/components/app/useNavigate";
import { closeSearch, readSessionHistory } from "./search-navigation";

/**
 * The search sheet's top bar (X10): `/search` is a full-screen sheet over
 * the app — opened from Home's field or a second tap on Home — so it has a
 * title and a Close instead of the tab bar. Close goes back to wherever the
 * sheet was opened from, however many searches were typed inside it, and
 * Home on a cold open, leaving no `/search` entry behind (CR-3): it steps
 * back past the sheet's entries, so Back afterwards does not reopen it.
 *
 * Recipes-Search draws no top bar: the tab bar stays. Until the shell shows
 * it on `/search` (hand-off to F2a's `AppShell`), the phone keeps Close as
 * its way out; from `md` the rail is there, and the bar is the page's h1
 * for screen readers only.
 */
export function SearchSheetHeader() {
  const navigate = useNavigate();
  const close = () =>
    closeSearch(
      navigate,
      previousPathOutside("/search"),
      readSessionHistory(),
      (delta) => {
        expectPop("back");
        window.history.go(delta);
      },
    );
  return (
    <div className="flex items-center justify-between gap-2 md:sr-only">
      <h1 className="t-title m-0 text-ink">Search</h1>
      <IconButton
        aria-label="Close search"
        onClick={close}
        className="-mr-2 md:hidden"
      >
        <Close aria-hidden strokeWidth={ICON_STROKE} />
      </IconButton>
    </div>
  );
}

/**
 * `/search`'s heading (F-103, FR-2): the shell shows the tab bar here now,
 * and Recipes-Search draws no top bar and no Close, so the page's one h1 is
 * for screen readers only at every width. `SearchSheetHeader` above is no
 * longer mounted; its Close is retired with the sheet (hand-off: remove it
 * and its `home-markup.test.tsx` case).
 */
export function SearchHeading() {
  return <h1 className="sr-only">Search</h1>;
}

/** What an empty search sheet says: what the box looks through. */
export function SearchHint() {
  return (
    <p className="t-cap px-1 text-ink-2">
      Your bottles, the catalog, places, recipes and brands. Scan a barcode or
      use a photo from the buttons in the box.
    </p>
  );
}
