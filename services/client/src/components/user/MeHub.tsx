import {
  type AppIcon,
  ChevronRight,
  Edit,
  Leaderboard,
  Love,
  People,
  Ranked,
  Scan,
  WantToTry,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { LoadingShell, ShellBlocks } from "@/components/app/LoadingShell";
import { InsetSection, ListRow, Page } from "@/components/app/Page";
import { UserAvatar } from "@/components/app/UserAvatar";
import { badgeVariants } from "@/components/ui/badge-variants";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ServerUser } from "@/utilities/auth-server";
import {
  badgeText,
  countTiles,
  EMPTY_ME_HUB,
  type MeCounts,
  type MeHubData,
  type PinnedTierList,
} from "./me-hub-data";
import { SignOutButton } from "./SignOutButton";

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
 * The rows the Me tab always shows (D1, design-direction §2), after the
 * viewer's pinned tier lists. Where the rest of the old side bar went:
 *
 * - **Recipes** — the Cellar tab's "Bar" segment and the Recipes section of
 *   search (`components/cellar/CellarSegments.tsx`, `/search`).
 * - **Brands** — the brand link on item pages and the Brands section of
 *   search; not in the nav.
 * - **Scans** stay here until Home's "Waiting on you" (X10) takes them.
 */
export const ME_SECTIONS: readonly {
  label: string;
  links: readonly MeLink[];
}[] = [
  {
    label: "Lists",
    links: [
      { label: "Top rated", href: "/rankings", icon: Leaderboard },
      {
        label: "Loved",
        href: "/favorites",
        icon: Love,
        description: "Drinks and recipes",
      },
      { label: "Want to try", href: "/want-to-try", icon: WantToTry },
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
    ],
  },
  {
    label: "More",
    links: [{ label: "Scans", href: "/map/scans", icon: Scan }],
  },
];

/**
 * The account's section: Edit profile and Sign out. "Settings" since X18 —
 * it is where anything about the app itself (not your collection) goes. No
 * theme switch: dark is the default and light ships only on evidence (D21).
 */
export const SETTINGS_LABEL = "Settings";

const Chevron = () => (
  <ChevronRight aria-hidden className="size-5" strokeWidth={1.75} />
);

/**
 * The visible count. Hidden from assistive tech: the row's link already says
 * it in words ("Friends, 2 friend requests"), which a bare "2" beside it
 * would only repeat.
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
  icon: Icon,
  badge = 0,
  badgeLabel,
  description,
}: MeLink) {
  return (
    <ListRow
      leading={<Icon aria-hidden className="size-5" strokeWidth={1.75} />}
      title={
        <Link href={href} overlay underline="none" className="text-ink-1">
          {label}
          {badge > 0 && (
            <span className="sr-only">
              , {badgeLabel?.(badge) ?? `${badge} waiting`}
            </span>
          )}
        </Link>
      }
      description={description}
      trailing={
        <>
          {badge > 0 && <CountBadge count={badge} />}
          <Chevron />
        </>
      }
    />
  );
}

/**
 * The header's count row (X18): bottles, logs, places, tier lists — each the
 * viewer's own, each naming its noun, a zero left out (design §3.7). A
 * summary, not a menu: every one of them has a row or a tab of its own, so
 * the tiles are not links. A `dl`, so each number is read with its noun.
 */
export function MeCountRow({
  counts,
}: {
  counts: MeCounts | null | undefined;
}) {
  const tiles = countTiles(counts);
  if (tiles.length === 0) return null;
  return (
    <dl
      aria-label="Your numbers"
      data-slot="me-counts"
      className="flex divide-x divide-line rounded-lg bg-surface-1 py-3"
    >
      {tiles.map((tile) => (
        <div
          key={tile.key}
          data-count={tile.key}
          className="flex min-w-0 flex-1 flex-col-reverse items-center gap-0.5 px-1"
        >
          <dt className="type-footnote truncate">{tile.noun}</dt>
          <dd className="type-title-1 tabular text-ink-1">{tile.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** "8 entries", or nothing for an empty list (counts are hidden at zero). */
const entriesLine = (count: number): string | undefined =>
  count === 0 ? undefined : `${count} ${count === 1 ? "entry" : "entries"}`;

/**
 * Me › Lists opens with the viewer's own tier lists (D1: "pinned at the top
 * of Me›Lists"), then one row into all of them. With none yet, that one row
 * is "Tier lists" and leads to the page where the first is made.
 */
function TierListRows({
  pinned,
  total,
}: {
  pinned: readonly PinnedTierList[];
  total: number | null;
}) {
  return (
    <>
      {pinned.map((list) => (
        <LinkRow
          key={list.id}
          label={list.name}
          href={`/tier-lists/${list.id}`}
          icon={Ranked}
          description={entriesLine(list.itemCount)}
        />
      ))}
      <LinkRow
        label={pinned.length === 0 ? "Tier lists" : "All tier lists"}
        href="/tier-lists"
        icon={Ranked}
        description={
          total !== null && total > pinned.length
            ? `${total} of yours`
            : undefined
        }
      />
    </>
  );
}

/**
 * The `/me` hub: who you are and your numbers, then grouped rows into
 * everything that is yours, then Settings (Edit profile, Sign out). A tab
 * root, so no Back.
 */
export function MeHub({
  user,
  data = EMPTY_ME_HUB,
}: {
  user: ServerUser;
  data?: MeHubData;
}) {
  const name = user.displayName?.trim() || user.email;
  const badges: Record<string, number> = {
    "/friends": data.pendingFriendRequests,
  };
  return (
    <Page>
      <header className="flex items-center gap-4 px-1 pt-2">
        {/* Decorative here: the name is the heading beside it, and the
            photo's alt would read it a second time. */}
        <UserAvatar
          aria-hidden
          avatarUrl={user.avatarUrl}
          displayName={name}
          size="lg"
          className="size-16 text-2xl"
        />
        <div className="flex min-w-0 flex-col">
          <h1 className="type-title-1 truncate">{name}</h1>
          {name !== user.email && (
            <p className="type-footnote truncate">{user.email}</p>
          )}
        </div>
      </header>
      <MeCountRow counts={data.counts} />
      {ME_SECTIONS.map((section) => (
        <InsetSection key={section.label} label={section.label}>
          {section.label === "Lists" && (
            <TierListRows
              pinned={data.pinnedTierLists}
              total={data.tierListCount}
            />
          )}
          {section.links.map((link) => (
            <LinkRow key={link.href} {...link} badge={badges[link.href] ?? 0} />
          ))}
        </InsetSection>
      ))}
      <InsetSection label={SETTINGS_LABEL}>
        <LinkRow
          label="Edit profile"
          href="/users/edit"
          icon={Edit}
          description="Your name, as friends see it"
        />
        <SignOutButton />
      </InsetSection>
    </Page>
  );
}

/**
 * `/me` while it loads (X24). Everything on the hub but the viewer's own
 * header is fixed, so the shell draws it for real — the same sections and
 * rows, live links included — and only the avatar, the name and the email,
 * the viewer's tier lists at the head of Lists, and the Sign out row (which
 * needs the client) are placeholders. The Friends badge waits for the page.
 */
export function MeHubShell() {
  return (
    <LoadingShell label="your profile">
      <Page>
        <ShellBlocks className="flex items-center gap-4 px-1 pt-2">
          <Skeleton className="size-16 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-7 w-[60%]" />
            <Skeleton className="h-4 w-[45%]" />
          </div>
        </ShellBlocks>
        {/* The count row's height, so the sections do not jump when it lands
            (an account with nothing yet has no row, and that is the rarer case). */}
        <ShellBlocks className="h-[76px] rounded-lg bg-surface-1" />
        {ME_SECTIONS.map((section) => (
          <InsetSection key={section.label} label={section.label}>
            {section.label === "Lists" && (
              // The viewer's tier lists head this section; how many, and
              // whether the row says "Tier lists" or "All tier lists", is data.
              <ShellBlocks className="flex min-h-11 items-center gap-3 px-4 py-2.5">
                <Skeleton className="size-5 shrink-0 rounded-sm" />
                <Skeleton className="h-5 w-32" />
              </ShellBlocks>
            )}
            {section.links.map((link) => (
              <LinkRow key={link.href} {...link} />
            ))}
          </InsetSection>
        ))}
        <InsetSection label={SETTINGS_LABEL}>
          <LinkRow
            label="Edit profile"
            href="/users/edit"
            icon={Edit}
            description="Your name, as friends see it"
          />
          <ShellBlocks className="flex min-h-11 items-center px-4 py-2.5">
            <Skeleton className="h-5 w-20" />
          </ShellBlocks>
        </InsetSection>
      </Page>
    </LoadingShell>
  );
}
