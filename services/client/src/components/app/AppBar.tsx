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
import { IconButton, type IconButtonProps } from "./IconButton";
import { type AppIcon, Back, More } from "./icons";
import { Link } from "./Link";
import { canGoBack } from "./nav-history";
import { GlassDisc } from "./overlays/GlassDisc";
import { PRESS_CLASS, pressFeedback } from "./overlays/press";
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
  /**
   * `photo`: the bar floats over a page hero (KIT § 2 "Top bar and discs"):
   * Back, the actions and ⋯ are 44 glass discs, and the title is for screen
   * readers only (the page sets the name under its photo).
   */
  tone?: "page" | "photo";
  /**
   * Sticks to the top of the scroller and takes the bar shadow once the
   * content scrolls under it (KIT § 2).
   */
  sticky?: boolean;
  className?: string;
};

/** A bar's icon control: plain on a surface, a glass disc over a photo. */
function BarButton({
  photo,
  className,
  ...props
}: IconButtonProps & { photo: boolean }) {
  return photo ? (
    <GlassDisc {...props} className={className} />
  ) : (
    <IconButton {...pressFeedback()} {...props} className={className} />
  );
}

/** Whether the scroller holding `ref` has scrolled content under it. */
function useStuck(
  ref: { current: HTMLElement | null },
  enabled: boolean,
): boolean {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const scroller = ref.current?.closest<HTMLElement>("[data-app-scroller]");
    if (scroller === null || scroller === undefined) return;
    const read = () => setStuck(scroller.scrollTop > 0);
    read();
    scroller.addEventListener("scroll", read, { passive: true });
    return () => scroller.removeEventListener("scroll", read);
  }, [ref, enabled]);
  return stuck;
}

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
  tone = "page",
  sticky = false,
  className,
}: AppBarProps) {
  const photo = tone === "photo";
  const headerRef = useRef<HTMLElement | null>(null);
  const stuck = useStuck(headerRef, sticky && !photo);
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
      ref={headerRef}
      data-slot="app-bar"
      data-tone={tone}
      data-stuck={stuck ? "" : undefined}
      className={cn(
        "flex min-h-11 flex-col gap-1",
        photo &&
          "absolute inset-x-0 top-0 z-10 px-3 pt-[calc(env(safe-area-inset-top)+12px)]",
        sticky &&
          !photo &&
          "sticky top-0 z-10 -mx-4 -mt-4 bg-background px-4 pt-4 pb-2 transition-shadow duration-(--ca-dur-short) data-[stuck]:shadow-bar",
        className,
      )}
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
          <BarButton
            photo={photo}
            aria-label="Back"
            onClick={goBack}
            onPointerDown={warmBack}
            className={photo ? undefined : "-ml-3"}
          >
            <Back />
          </BarButton>
        )}
        {/* Over a photo the title is for screen readers only, but the spacer
            stays in flow so the ⋯ sits at the right (F-47). */}
        <div className="min-w-0 flex-1">
          <div className={cn(photo && "sr-only")}>
            {typeof title === "string" ? (
              <h1 className="t-title truncate text-ink">{title}</h1>
            ) : (
              title
            )}
          </div>
        </div>
        {trailing.map(({ label, icon: Icon, href, onSelect }) =>
          href !== undefined ? (
            <BarButton photo={photo} key={label} aria-label={label} asChild>
              <Link href={href} underline="none">
                <Icon />
              </Link>
            </BarButton>
          ) : (
            <BarButton
              photo={photo}
              key={label}
              aria-label={label}
              onClick={onSelect}
            >
              <Icon />
            </BarButton>
          ),
        )}
        {overflow.length > 0 &&
          (desktop ? (
            // Non-modal: an item that opens a dialog must not race the menu's
            // own modal teardown (the same stuck pointer-events as above).
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <BarButton photo={photo} aria-label="More actions">
                  <More />
                </BarButton>
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
              <BarButton
                photo={photo}
                aria-label="More actions"
                aria-haspopup="dialog"
                onClick={() => setSheetOpen(true)}
              >
                <More />
              </BarButton>
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
                        {...pressFeedback()}
                        onClick={() => {
                          pending.current = item.onSelect;
                          setSheetOpen(false);
                        }}
                        className={cn(
                          "t-body flex min-h-12 w-full items-center rounded-md px-3 text-left hover:bg-raised",
                          PRESS_CLASS,
                          item.destructive ? "text-danger" : "text-ink",
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
