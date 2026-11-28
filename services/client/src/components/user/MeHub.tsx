import { Fragment } from "react";
import {
  type AppIcon,
  ChevronRight,
  Explore,
  ICON_STROKE,
  Leaderboard,
  Love,
  People,
  PersonAdd,
  Ranked,
  Settings,
  WantToTry,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { LoadingShell, ShellBlocks } from "@/components/app/LoadingShell";
import { InsetSection, ListRow, Page } from "@/components/app/Page";
import { BAND_FILL, type Band } from "@/components/app/parts/Rank";
import { StatGrid, StatTile } from "@/components/app/parts/StatTile";
import { badgeVariants } from "@/components/ui/badge-variants";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ServerUser } from "@/utilities/auth-server";
import { MeHeader, MeRequestRow } from "./MeLinks";
import { MeStamps } from "./MeStamps";
import {
  type BandCount,
  badgeText,
  type CountTile,
  countTiles,
  EMPTY_ME_EXTRAS,
  EMPTY_ME_HUB,
  type MeCounts,
  type MeExtras,
  type MeHubData,
  type PinnedTierList,
} from "./me-hub-data";
import { PressLink } from "./PressLink";
import { BOLD_LABEL } from "./section-label";

export type MeLink = {
  label: string;
  href: string;
  icon: AppIcon;
  /** A second line under the label ("Drinks and recipes"). */
  description?: string;
  /** A count waiting on the viewer, shown as a badge (hidden at 0). */
  badge?: number;
  /** What the badge counts, for assistive tech: "2 friend requests". */
  badgeLabel?: (count: number) => string;
};

/**
 * The rows the Me tab always shows (D1, Shell-Me). The viewer's pinned tier
 * lists sit in Lists between Want to try and Top rated. Where the rest of
 * the old side bar went:
 *
 * - **Recipes** — the Cellar tab's "Bar" segment and the Recipes section of
 *   search (`components/cellar/CellarSegments.tsx`, `/search`).
 * - **Brands** — the brand link on item pages and the Brands section of
 *   search; not in the nav.
 * - **Scans** — Home's job tray and "Waiting on you" (X10); each scan's own
 *   page stays, and `/map/scans` redirects to the inbox.
 */
export const ME_SECTIONS: readonly {
  label: string;
  links: readonly MeLink[];
}[] = [
  {
    label: "Lists",
    links: [
      {
        label: "Loved",
        href: "/favorites",
        icon: Love,
        description: "Drinks and recipes",
      },
      { label: "Want to try", href: "/want-to-try", icon: WantToTry },
      { label: "Top rated", href: "/rankings", icon: Leaderboard },
      // L03: your archetype, and where you and each friend agree.
      {
        label: "Taste profile",
        href: "/taste-profile",
        icon: Explore,
        description: "Your archetype and friends",
      },
    ],
  },
  {
    label: "People",
    links: [
      {
        label: "Friends",
        href: "/friends",
        icon: People,
        badgeLabel: (count) =>
          `${count} friend ${count === 1 ? "request" : "requests"}`,
      },
      {
        label: "Add a friend",
        href: "/friends#invite-friends",
        icon: PersonAdd,
      },
    ],
  },
];

/**
 * The last row on the hub: everything about the app rather than the
 * collection (Appearance, Sound and haptics, location, Sign out) lives on
 * `/me/settings`. Edit profile is the header itself.
 */
export const SETTINGS_LABEL = "Settings";

const Chevron = () => (
  <ChevronRight
    aria-hidden
    className="size-5 text-glyph"
    strokeWidth={ICON_STROKE}
  />
);

/** The row's glyph, in a 40 well. */
const Well = ({ icon: Icon }: { icon: AppIcon }) => (
  <span className="flex size-10 items-center justify-center rounded-md bg-raised text-glyph">
    <Icon aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
  </span>
);

/**
 * The visible badge. Hidden from assistive tech: the row's link already says
 * it in words ("Friends, 2 friend requests").
 */
function CountBadge({ count }: { count: number }) {
  return (
    <span
      aria-hidden
      data-slot="count-badge"
      className={cn(badgeVariants(), "tabular min-w-6 px-1.5")}
    >
      {badgeText(count)}
    </span>
  );
}

function LinkRow({
  label,
  href,
  icon,
  badge = 0,
  badgeLabel,
  description,
  count,
}: MeLink & { count?: number | null }) {
  return (
    <ListRow
      leading={<Well icon={icon} />}
      title={
        <PressLink href={href} overlay underline="none" className="text-ink">
          {label}
          {badge > 0 && (
            <span className="sr-only">
              , {badgeLabel?.(badge) ?? `${badge} waiting`}
            </span>
          )}
        </PressLink>
      }
      description={description}
      trailing={
        <>
          {count !== undefined && count !== null && count > 0 && (
            <span data-slot="row-count" className="t-cap tabular text-ink-3">
              {count}
            </span>
          )}
          {badge > 0 && <CountBadge count={badge} />}
          <Chevron />
        </>
      }
    />
  );
}

/** Where each number opens; Logs has no list of its own, so it is static. */
const TILE_HREF: Readonly<Partial<Record<keyof MeCounts, string>>> = {
  bottles: "/cellars",
  places: "/places",
  tierLists: "/tier-lists",
};

const tileLabel = (tile: CountTile): string =>
  tile.noun.charAt(0).toUpperCase() + tile.noun.slice(1);

/**
 * The hub's numbers (X18, Shell-Me): bottles, logs, places, tier lists, two
 * tiles a row, a zero left out (design §3.7). Each tile with a list of its
 * own opens it.
 */
export function MeCountRow({
  counts,
}: {
  counts: MeCounts | null | undefined;
}) {
  const tiles = countTiles(counts);
  if (tiles.length === 0) return null;
  return (
    <section aria-label="Your numbers" data-slot="me-counts">
      <StatGrid>
        {tiles.map((tile) => {
          const href = TILE_HREF[tile.key];
          return href === undefined ? (
            <div key={tile.key} data-count={tile.key}>
              <StatTile value={tile.value} label={tileLabel(tile)} />
            </div>
          ) : (
            <PressLink
              key={tile.key}
              data-count={tile.key}
              href={href}
              underline="none"
              className="rounded-md outline-none focus-visible:outline-2 focus-visible:outline-act-ink"
            >
              <StatTile value={tile.value} label={tileLabel(tile)} />
            </PressLink>
          );
        })}
      </StatGrid>
    </section>
  );
}

/** A pinned list's bands, best first, each as wide as its share. */
function BandStrip({ bands }: { bands: readonly BandCount[] }) {
  if (bands.length === 0) return null;
  return (
    <span
      aria-hidden
      data-slot="band-strip"
      className="mt-1 flex h-1.5 w-full max-w-48 gap-px overflow-hidden rounded-full"
    >
      {bands.map(({ band, count }) => (
        <span
          key={band}
          className={BAND_FILL[band as Band] ?? "bg-edge"}
          style={{ flexGrow: count }}
        />
      ))}
    </span>
  );
}

/**
 * The viewer's own tier lists, pinned in Lists (D1), each with its band
 * strip and count, then one row into all of them. With none yet, that row
 * is "Tier lists" and leads to the page where the first is made.
 */
function TierListRows({
  pinned,
  total,
  bands,
}: {
  pinned: readonly PinnedTierList[];
  total: number | null;
  bands: MeExtras["bands"];
}) {
  return (
    <>
      {pinned.map((list) => (
        <ListRow
          key={list.id}
          leading={<Well icon={Ranked} />}
          title={
            <PressLink
              href={`/tier-lists/${list.id}`}
              overlay
              underline="none"
              className="text-ink"
            >
              {list.name}
            </PressLink>
          }
          description={
            list.itemCount > 0 ? (
              <BandStrip bands={bands[list.id] ?? []} />
            ) : undefined
          }
          trailing={
            <>
              {list.itemCount > 0 && (
                <span
                  data-slot="row-count"
                  className="t-cap tabular text-ink-3"
                >
                  {list.itemCount}
                </span>
              )}
              <Chevron />
            </>
          }
        />
      ))}
      <LinkRow
        label={pinned.length === 0 ? "Tier lists" : "All tier lists"}
        href="/tier-lists"
        icon={Ranked}
        count={total !== null && total > pinned.length ? total : undefined}
      />
    </>
  );
}

/**
 * The `/me` hub (Shell-Me): who you are and your numbers, stamps, then
 * Lists and People, then one row into Settings. A tab root, so no Back.
 */
export function MeHub({
  user,
  data = EMPTY_ME_HUB,
  extras = EMPTY_ME_EXTRAS,
}: {
  user: ServerUser;
  data?: MeHubData;
  extras?: MeExtras;
}) {
  const name = user.displayName?.trim() || user.email;
  const badges: Record<string, number> = {
    "/friends": data.pendingFriendRequests,
  };
  const counts: Record<string, number | null> = {
    "/favorites": extras.loved,
    "/want-to-try": extras.wantToTry,
    "/friends": extras.friends,
  };
  return (
    <Page>
      <MeHeader
        name={name}
        email={user.email}
        avatarUrl={user.avatarUrl ?? null}
        displayName={user.displayName ?? ""}
      />
      <MeCountRow counts={data.counts} />
      {/* ux-c M4 slot: fetches its own data, renders nothing until then. */}
      <MeStamps />
      {ME_SECTIONS.map((section) => (
        <InsetSection
          key={section.label}
          label={section.label}
          className={BOLD_LABEL}
        >
          {section.label === "People" &&
            extras.requests.map((request) => (
              <MeRequestRow key={request.id} request={request} />
            ))}
          {section.links.map((link) => (
            <Fragment key={link.href}>
              {link.href === "/rankings" && (
                <TierListRows
                  pinned={data.pinnedTierLists}
                  total={data.tierListCount}
                  bands={extras.bands}
                />
              )}
              <LinkRow
                {...link}
                badge={badges[link.href] ?? 0}
                count={counts[link.href]}
              />
            </Fragment>
          ))}
        </InsetSection>
      ))}
      <div
        data-slot="me-settings"
        className="overflow-hidden rounded-md border border-edge bg-card"
      >
        <LinkRow
          label={SETTINGS_LABEL}
          href="/me/settings"
          icon={Settings}
          description="Appearance, sound and sign out"
        />
      </div>
    </Page>
  );
}

/**
 * `/me` while it loads (X24). Everything but the viewer's own header and
 * numbers is fixed, so the shell draws it for real — the same sections and
 * rows, live links included. The header is a placeholder that is still the
 * way into Edit profile; the Friends badge and the counts wait for the page.
 */
export function MeHubShell() {
  return (
    <LoadingShell label="your profile">
      <Page>
        <ShellBlocks className="relative flex items-center gap-4 pt-2">
          <Link
            href="/users/edit"
            overlay
            underline="none"
            aria-label="Edit profile"
          />
          <Skeleton className="size-16 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-7 w-[60%]" />
            <Skeleton className="h-4 w-[45%]" />
          </div>
        </ShellBlocks>
        {/* Two rows of number tiles (88 each, 12 between). */}
        <ShellBlocks className="grid h-[188px] grid-cols-2 gap-3">
          <Skeleton className="rounded-md" />
          <Skeleton className="rounded-md" />
          <Skeleton className="rounded-md" />
          <Skeleton className="rounded-md" />
        </ShellBlocks>
        {ME_SECTIONS.map((section) => (
          <InsetSection
            key={section.label}
            label={section.label}
            className={BOLD_LABEL}
          >
            {section.links.map((link) => (
              <Fragment key={link.href}>
                {link.href === "/rankings" && (
                  <ShellBlocks className="flex min-h-14 items-center gap-3 px-3.5 py-1.5">
                    <Skeleton className="size-10 shrink-0 rounded-md" />
                    <Skeleton className="h-5 w-32" />
                  </ShellBlocks>
                )}
                <LinkRow {...link} />
              </Fragment>
            ))}
          </InsetSection>
        ))}
        <div
          data-slot="me-settings"
          className="overflow-hidden rounded-md border border-edge bg-card"
        >
          <LinkRow
            label={SETTINGS_LABEL}
            href="/me/settings"
            icon={Settings}
            description="Appearance, sound and sign out"
          />
        </div>
      </Page>
    </LoadingShell>
  );
}
