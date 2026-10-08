"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppBar } from "@/components/app/AppBar";
import { SearchField } from "@/components/shell/SearchField";
import { cn } from "@/lib/utils";
import { generateBreadcrumbs, pageHeader } from "./breadcrumbs";

type HeaderBarProps = {
  // Server breadcrumbs with optional context
  serverBreadcrumbs?: {
    cellarName?: string;
    itemName?: string;
    recipeName?: string;
  };
  // End component (buttons, actions, etc.)
  endComponent?: ReactNode;
  // Search functionality
  onSearchChange?: (value: string) => void;
  isSearching?: boolean;
  defaultSearchValue?: string;
  /**
   * The search field's accessible name. The visible placeholder is a terse
   * "Search"; this says what is searched ("Search this cellar").
   */
  searchLabel?: string;
};

/**
 * The page header the converted and unconverted screens share. Same props as
 * the Joy-era one; it now renders `AppBar` (N26):
 *
 * - **Phones:** a real Back and the page's title, from the same crumb rule
 *   (`pageHeader`): Back is in-app history, or the parent crumb on a cold
 *   deep link. A tab root (`/cellars`) draws no Back at all.
 * - **From `md`:** the breadcrumb trail above the title, as before.
 * - The title is the page's h1, except on an item's or a recipe's own page,
 *   whose content already heads itself with that name.
 * - The search box and the caller's `endComponent` follow: stacked under the
 *   bar on a phone, a wrapping row under it from `sm`, beside it from `lg`.
 *
 * Without `serverBreadcrumbs` there is no bar, and the end slot sits right.
 */
export const HeaderBar = ({
  serverBreadcrumbs,
  endComponent,
  isSearching = false,
  onSearchChange,
  defaultSearchValue = "",
  searchLabel = "Search",
}: HeaderBarProps) => {
  const pathname = usePathname() ?? "/";
  const crumbs =
    serverBreadcrumbs === undefined
      ? undefined
      : generateBreadcrumbs(
          pathname,
          serverBreadcrumbs.cellarName,
          serverBreadcrumbs.itemName,
          serverBreadcrumbs.recipeName,
        );
  const header =
    crumbs === undefined ? undefined : pageHeader(pathname, crumbs);
  const hasEnd = onSearchChange !== undefined || endComponent !== undefined;
  // An item's or a recipe's own page prints its name as the content's
  // heading (ItemDetails, RecipeDetailsCard). A second heading with the same
  // name in the bar would be read twice and makes `getByRole("heading",
  // { name })` ambiguous (e2e 11-items), so there the bar's title is plain
  // text. Everywhere else — lists, a cellar's items, edit pages — the bar's
  // title is the page's only heading and stays the h1.
  const titleIsContentHeading =
    header !== undefined &&
    (header.title === serverBreadcrumbs?.itemName ||
      header.title === serverBreadcrumbs?.recipeName);

  return (
    <div
      data-slot="header-bar"
      // Side by side only from `lg`: between `sm` and `lg` a row left the
      // bar (Back, title, crumbs) a sliver beside a cellar's search, type
      // counts and "Add item", and pushed "Add item" off the edge at 600.
      className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
    >
      {header !== undefined && crumbs !== undefined && (
        <AppBar
          title={
            titleIsContentHeading ? (
              <p className="type-headline truncate">{header.title}</p>
            ) : (
              header.title
            )
          }
          parent={header.parent}
          root={header.tabRoot}
          breadcrumbs={crumbs}
          className="min-w-0 flex-1"
        />
      )}
      {hasEnd && (
        <div
          className={cn(
            "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center",
            header === undefined && "sm:ml-auto",
          )}
        >
          {onSearchChange !== undefined && (
            <SearchField
              defaultValue={defaultSearchValue}
              debounceTimeout={300}
              searching={isSearching}
              placeholder="Search"
              aria-label={searchLabel}
              onDebounced={onSearchChange}
              className="sm:w-60"
            />
          )}
          {endComponent}
        </div>
      )}
    </div>
  );
};
