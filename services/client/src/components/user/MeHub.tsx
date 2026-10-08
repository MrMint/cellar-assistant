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
import { InsetSection, ListRow, Page } from "@/components/app/Page";
import { UserAvatar } from "@/components/app/UserAvatar";
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
        <UserAvatar
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
