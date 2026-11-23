"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { breakpointUp, useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./BottomSheet";
import { IconButton } from "./IconButton";
import { type AppIcon, Back, More } from "./icons";
import { Link } from "./Link";
import { canGoBack } from "./nav-history";
import { useNavigate } from "./useNavigate";

export type AppBarAction = {
  label: string;
  icon: AppIcon;
} & (
  | { href: string; onSelect?: never }
  | { onSelect: () => void; href?: never }
);

export type AppBarOverflowItem = {
  label: string;
  onSelect: () => void;
  /** Danger text; keep Delete last (design §2, detail screens). */
  destructive?: boolean;
};

export type AppBarProps = {
  title?: ReactNode;
  /**
   * Where Back goes when there is no in-app page behind this one (a cold
   * open of a deep link). Omit on tab roots: no Back is drawn without either
   * a parent or in-app history.
   */
  parent?: string;
  /**
   * A tab root (`/cellars`, `/me`): never draws Back, even with in-app
   * history behind it (iOS convention — the tab bar is the way out).
   */
  root?: boolean;
  /** Up to two trailing icon actions; anything more goes in `overflow`. */
  actions?: readonly [AppBarAction?, AppBarAction?];
  /** The `⋯` menu: an action sheet on phones, a dropdown from `md` up. */
  overflow?: readonly AppBarOverflowItem[];
  /** Desktop only (N26): hidden below `md`, where Back does the job. */
  breadcrumbs?: readonly { label: string; href?: string }[];
  className?: string;
};

/**
 * The page header (N26): a real Back, a title, at most two actions and a
 * `⋯` overflow. Back uses the in-app history (`navigate.back()`) when there is
 * one and the declared `parent` otherwise, so a deep link opened cold in the
 * standalone PWA never strands the user.
 *
 * The collapsing large title waits for B02; this is the compact bar.
 */
/** Longer than vaul's close animation; only used when no animation end fires. */
const CLOSE_FALLBACK_MS = 600;

export function AppBar({
  title,
  parent,
  root = false,
  actions = [],
  overflow = [],
  breadcrumbs,
  className,
}: AppBarProps) {
  const router = useRouter();
  const navigate = useNavigate();
  const desktop = useMediaQuery(breakpointUp("md"));
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  // An overflow item chosen on a phone runs only after the sheet has closed:
  // its action often opens a ConfirmSheet, and a second modal mounting while
  // the first is still closing can leave `pointer-events: none` stuck on body.
  const pending = useRef<(() => void) | null>(null);
  const runPending = useCallback(() => {
    const action = pending.current;
    pending.current = null;
    action?.();
  }, []);
  // Fallback for when no close animation runs (reduced motion, tests): the
  // ref makes a second call a no-op.
  useEffect(() => {
    if (sheetOpen || pending.current === null) return;
    const id = window.setTimeout(runPending, CLOSE_FALLBACK_MS);
    return () => window.clearTimeout(id);
  }, [sheetOpen, runPending]);
  // Read after mount: sessionStorage does not exist on the server, and a
  // Back that appeared only on the client would be a hydration mismatch.
  const [hasHistory, setHasHistory] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-read on every route change.
  useEffect(() => setHasHistory(canGoBack()), [pathname]);
  const showBack = !root && (parent !== undefined || hasHistory);

  const goBack = () => {
    if (canGoBack()) navigate.back();
    else if (parent !== undefined) navigate.push(parent);
  };
  // A cold deep link's Back is a push to `parent`: start its prefetch at the
  // pointerdown, as every in-app link does (X24). History Back needs none.
  const warmBack = () => {
    if (!canGoBack() && parent !== undefined) router.prefetch(parent);
  };

  const trailing = actions.filter((a): a is AppBarAction => a !== undefined);

  return (
    <header
      data-slot="app-bar"
      className={cn("flex min-h-11 flex-col gap-1", className)}
    >
      {breadcrumbs !== undefined && breadcrumbs.length > 0 && (
        <Breadcrumb className="hidden md:block">
          <BreadcrumbList>
            {breadcrumbs.map((crumb, i) => (
              <Fragment key={`${crumb.label}-${crumb.href ?? i}`}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {i === breadcrumbs.length - 1 ? (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  ) : crumb.href !== undefined ? (
                    <BreadcrumbLink asChild>
                      <Link href={crumb.href}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    // An ancestor with no page of its own (an item's type
                    // label): plain text, not a second "current page".
                    <span data-slot="breadcrumb-text">{crumb.label}</span>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <div className="flex min-h-11 items-center gap-1">
        {showBack && (
          <IconButton
            aria-label="Back"
            onClick={goBack}
            onPointerDown={warmBack}
            className="-ml-3"
          >
            <Back />
          </IconButton>
        )}
        <div className="min-w-0 flex-1">
          {typeof title === "string" ? (
            <h1 className="type-headline truncate">{title}</h1>
          ) : (
            title
          )}
        </div>
        {trailing.map(({ label, icon: Icon, href, onSelect }) =>
          href !== undefined ? (
            <IconButton key={label} aria-label={label} asChild>
              <Link href={href} underline="none">
                <Icon />
              </Link>
            </IconButton>
          ) : (
            <IconButton key={label} aria-label={label} onClick={onSelect}>
              <Icon />
            </IconButton>
          ),
        )}
        {overflow.length > 0 &&
          (desktop ? (
            // Non-modal: an item that opens a dialog must not race the menu's
            // own modal teardown (the same stuck pointer-events as above).
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <IconButton aria-label="More actions">
                  <More />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                // The chosen action runs once the menu has handed focus back
                // to ⋯ (Radix's own handler runs after this one, hence the
                // microtask): a dialog it opens then records ⋯ as its opener
                // and returns focus there, not to the unmounted menuitem
                // (which left focus on <body>, measured on the lane).
                onCloseAutoFocus={() => queueMicrotask(runPending)}
              >
                {overflow.map((item) => (
                  <DropdownMenuItem
                    key={item.label}
                    variant={item.destructive ? "destructive" : "default"}
                    onSelect={() => {
                      pending.current = item.onSelect;
                    }}
                  >
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <IconButton
                aria-label="More actions"
                aria-haspopup="dialog"
                onClick={() => setSheetOpen(true)}
              >
                <More />
              </IconButton>
              <BottomSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                onClosed={runPending}
                title={typeof title === "string" ? title : "Actions"}
                hideTitle
              >
                <ul className="flex flex-col py-2">
                  {overflow.map((item) => (
                    <li key={item.label}>
                      <button
                        type="button"
                        onClick={() => {
                          pending.current = item.onSelect;
                          setSheetOpen(false);
                        }}
                        className={cn(
                          "type-body flex min-h-12 w-full items-center rounded-md px-3 text-left active:bg-surface-3",
                          item.destructive ? "text-destructive" : "text-ink-1",
                        )}
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </BottomSheet>
            </>
          ))}
      </div>
    </header>
  );
}
