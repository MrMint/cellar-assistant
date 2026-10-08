import {
  type AppIcon,
  ChevronRight,
  Edit,
  Leaderboard,
  Love,
  People,
  Ranked,
  Scan,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { InsetSection, ListRow, Page } from "@/components/app/Page";
import { UserAvatar } from "@/components/app/UserAvatar";
import { badgeVariants } from "@/components/ui/badge-variants";
import { cn } from "@/lib/utils";
import type { ServerUser } from "@/utilities/auth-server";
import {
  badgeText,
  EMPTY_ME_HUB,
  type MeHubData,
  type PinnedTierList,
} from "./me-hub-data";
import { SignOutButton } from "./SignOutButton";

export type MeLink = {
  label: string;
  href: string;
  icon: AppIcon;
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
      { label: "Loved", href: "/favorites", icon: Love },
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
}: MeLink & { description?: string }) {
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
 * The `/me` hub: who you are, then grouped rows into everything that is
 * yours, then the account (Edit profile, Sign out). A tab root, so no Back.
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
      <InsetSection label="Account">
        <LinkRow label="Edit profile" href="/users/edit" icon={Edit} />
        <SignOutButton />
      </InsetSection>
    </Page>
  );
}
