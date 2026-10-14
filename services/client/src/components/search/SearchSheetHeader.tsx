"use client";

import { useRouter } from "next/navigation";
import { IconButton } from "@/components/app/IconButton";
import { Close, ICON_STROKE } from "@/components/app/icons";
import { previousPathOutside } from "@/components/app/nav-history";

/**
 * The search sheet's top bar (X10): `/search` is a full-screen sheet over
 * the app — opened from Home's field or a second tap on Home — so it has a
 * title and a Close instead of the tab bar. Close goes back to wherever the
 * sheet was opened from, however many searches were typed inside it, and
 * Home on a cold open.
 */
export function SearchSheetHeader() {
  const router = useRouter();
  const close = () => router.push(previousPathOutside("/search") ?? "/");
  return (
    <div className="flex items-center justify-between gap-2">
      <h1 className="type-title-2 text-ink-1">Search</h1>
      <IconButton aria-label="Close search" onClick={close} className="-mr-2">
        <Close aria-hidden strokeWidth={ICON_STROKE} />
      </IconButton>
    </div>
  );
}

/** What an empty search sheet says: what the box looks through. */
export function SearchHint() {
  return (
    <p className="type-callout px-1 text-ink-3">
      Your bottles, the catalog, places, recipes and brands. Scan a barcode or
      use a photo from the buttons in the box.
    </p>
  );
}
