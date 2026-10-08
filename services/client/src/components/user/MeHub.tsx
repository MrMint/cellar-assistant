import {
  type AppIcon,
  ChevronRight,
  Edit,
  Leaderboard,
  Love,
  People,
  Ranked,
  Recipe,
  Scan,
  Store,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { LoadingShell, ShellBlocks } from "@/components/app/LoadingShell";
import { InsetSection, ListRow, Page } from "@/components/app/Page";
import { UserAvatar } from "@/components/app/UserAvatar";
import { Skeleton } from "@/components/ui/skeleton";
import type { ServerUser } from "@/utilities/auth-server";
import { SignOutButton } from "./SignOutButton";

export type MeLink = { label: string; href: string; icon: AppIcon };

/**
 * What the Me tab gathers (D1, design-direction §2): the destinations the old
 * side bar listed that are no longer tabs, plus the old avatar menu.
 * Recipes sit here until the Cellar tab's "Bar" segment exists; Scans are
 * the map's `/map/scans` (Home's "Waiting on you" comes with X10).
 */
export const ME_SECTIONS: readonly {
  label: string;
  links: readonly MeLink[];
}[] = [
  {
    label: "Lists",
    links: [
      { label: "Tier lists", href: "/tier-lists", icon: Ranked },
      { label: "Top rated", href: "/rankings", icon: Leaderboard },
      { label: "Loved", href: "/favorites", icon: Love },
    ],
  },
  {
    label: "People",
    links: [{ label: "Friends", href: "/friends", icon: People }],
  },
  {
    label: "More",
    links: [
      { label: "Recipes", href: "/recipes", icon: Recipe },
      { label: "Brands", href: "/brands", icon: Store },
      { label: "Scans", href: "/map/scans", icon: Scan },
    ],
  },
];

function LinkRow({ label, href, icon: Icon }: MeLink) {
  return (
    <ListRow
      leading={<Icon aria-hidden className="size-5" strokeWidth={1.75} />}
      title={
        <Link href={href} overlay underline="none" className="text-ink-1">
          {label}
        </Link>
      }
      trailing={
        <ChevronRight aria-hidden className="size-5" strokeWidth={1.75} />
      }
    />
  );
}

/**
 * The `/me` hub: who you are, then grouped rows into everything that is
 * yours, then the account (Edit profile, Sign out). A tab root, so no Back.
 */
export function MeHub({ user }: { user: ServerUser }) {
  const name = user.displayName?.trim() || user.email;
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
          {section.links.map((link) => (
            <LinkRow key={link.href} {...link} />
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

/**
 * `/me` while it loads (X24). Everything on the hub but the viewer's own
 * header is fixed, so the shell draws it for real — the same sections and
 * rows, live links included — and only the avatar, the name and the email
 * (and the Sign out row, which needs the client) are placeholders.
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
        {ME_SECTIONS.map((section) => (
          <InsetSection key={section.label} label={section.label}>
            {section.links.map((link) => (
              <LinkRow key={link.href} {...link} />
            ))}
          </InsetSection>
        ))}
        <InsetSection label="Account">
          <LinkRow label="Edit profile" href="/users/edit" icon={Edit} />
          <ShellBlocks className="flex min-h-11 items-center px-4 py-2.5">
            <Skeleton className="h-5 w-20" />
          </ShellBlocks>
        </InsetSection>
      </Page>
    </LoadingShell>
  );
}
