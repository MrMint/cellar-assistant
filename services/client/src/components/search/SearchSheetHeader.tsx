"use client";

/**
 * `/search`'s heading (F-103, FR-2): the shell shows the tab bar here now,
 * and Recipes-Search draws no top bar and no Close, so the page's one h1 is
 * for screen readers only at every width. The old sheet header and its
 * Close are gone (H-123).
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
