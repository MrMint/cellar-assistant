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
};

/**
 * The page header the converted and unconverted screens share. Same props as
 * the Joy-era one; it now renders `AppBar` (N26):
 *
 * - **Phones:** a real Back and the page's title, from the same crumb rule
 *   (`pageHeader`): Back is in-app history, or the parent crumb on a cold
 *   deep link. A tab root (`/cellars`) draws no Back at all.
 * - **From `md`:** the breadcrumb trail above the title, as before.
 * - The search box and the caller's `endComponent` follow — below the bar on
 *   a phone, beside it from `sm`, as the old row did.
 *
 * Without `serverBreadcrumbs` there is no bar, and the end slot sits right.
 */
export const HeaderBar = ({
  serverBreadcrumbs,
  endComponent,
  isSearching = false,
  onSearchChange,
  defaultSearchValue = "",
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

  return (
    <div
      data-slot="header-bar"
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      {header !== undefined && crumbs !== undefined && (
        <AppBar
          title={header.title}
          parent={header.parent}
          breadcrumbs={crumbs}
          className={cn(
            "min-w-0 flex-1",
            // A tab root never shows Back (iOS convention), even with in-app
            // history behind it: AppBar draws one whenever history exists,
            // so it is hidden here until AppBar takes a `root` prop.
            header.tabRoot && "[&_button[aria-label=Back]]:hidden",
          )}
        />
      )}
      {hasEnd && (
        <div
          className={cn(
            "flex flex-col gap-2 sm:flex-row sm:items-center",
            header === undefined && "sm:ml-auto",
          )}
        >
          {onSearchChange !== undefined && (
            <SearchField
              defaultValue={defaultSearchValue}
              debounceTimeout={300}
              searching={isSearching}
              placeholder="Search"
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
