import { AppBar } from "@/components/app/AppBar";
import { EmptyState } from "@/components/app/EmptyState";
import { Lock } from "@/components/app/icons";
import { LoadingShell, ShellBlocks } from "@/components/app/LoadingShell";
import { Page } from "@/components/app/Page";
import { UserAvatar } from "@/components/app/UserAvatar";
import { CompareColumn } from "@/components/taste/compare/CompareColumn";
import { firstName } from "@/components/taste/compare/compare-lines";
import { TasteCompareSection } from "@/components/taste/TasteCompareSection";
import { Skeleton } from "@/components/ui/skeleton";
import { type FriendProfileView, sharesNothing } from "./adapter";
import { FriendLog } from "./FriendLog";
import { FriendCellars, FriendTierLists } from "./FriendSections";
import { RemoveFriend } from "./RemoveFriend";

/** Who: the avatar, their name (the page's one h1), and the line under it. */
export function ProfileHeader({
  name,
  avatarUrl,
  line,
  headingLevel = 1,
}: {
  name: string;
  avatarUrl: string | null;
  line?: string;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <header className="flex items-center gap-4">
      {/* Decorative: the name is the heading beside it. */}
      <UserAvatar
        aria-hidden
        avatarUrl={avatarUrl}
        displayName={name}
        size="xl"
      />
      <div className="flex min-w-0 flex-col">
        <Heading className="t-title truncate text-ink">{name}</Heading>
        {line !== undefined && (
          <p className="t-cap truncate text-ink-2">{line}</p>
        )}
      </div>
    </header>
  );
}

/**
 * A friend's profile without its frame (Social-Friends 03 to 07): who and
 * since when, the agreement card, then what they share with you — their lists
 * (each with Copy), their cellars, their log — and Remove friend at the
 * foot. The `/users/[id]` page and the desktop Friends pane both draw this.
 *
 * A section with nothing in it is not drawn (D2's rule for other people's
 * sections), and a friend who shares nothing at all gets one empty state.
 * The privacy rules are the API's; this only draws what came back.
 */
export function FriendProfileBody({
  view,
  headingLevel = 1,
  onRemoved,
}: {
  view: FriendProfileView;
  headingLevel?: 1 | 2;
  onRemoved?: () => void;
}) {
  return (
    <div data-slot="friend-profile" className="flex min-w-0 flex-col gap-6">
      <ProfileHeader
        name={view.name}
        avatarUrl={view.avatarUrl}
        line={view.sinceLine}
        headingLevel={headingLevel}
      />
      <TasteCompareSection userId={view.userId} />
      {sharesNothing(view) ? (
        <EmptyState
          illustration={<Lock aria-hidden strokeWidth={1.5} />}
          title="Nothing shared yet"
        />
      ) : (
        <>
          {view.tierLists.rows.length > 0 && (
            <FriendTierLists
              userId={view.userId}
              initialPage={view.tierLists}
            />
          )}
          {view.cellars.rows.length > 0 && (
            <FriendCellars userId={view.userId} initialPage={view.cellars} />
          )}
          {view.logs.rows.length > 0 && (
            <FriendLog
              userId={view.userId}
              name={firstName(view.name)}
              initialPage={view.logs}
            />
          )}
        </>
      )}
      <RemoveFriend
        userId={view.userId}
        name={view.name}
        onRemoved={onRemoved}
      />
    </div>
  );
}

/** The crumbs every person page shares (desktop only). */
export const personCrumbs = (name: string) =>
  [
    { label: "Me", href: "/me" },
    { label: "Friends", href: "/friends" },
    { label: name },
  ] as const;

/**
 * `/users/[id]` — a friend's read-only profile (X18). On a phone, one column;
 * from `md` up, the compare column sits beside it (Social-Friends-desktop).
 */
export function FriendProfile({ view }: { view: FriendProfileView }) {
  return (
    <Page wide>
      <AppBar parent="/friends" breadcrumbs={personCrumbs(view.name)} />
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:items-start">
        <FriendProfileBody view={view} />
        <CompareColumn
          userId={view.userId}
          name={view.name}
          className="lg:sticky lg:top-4"
        />
      </div>
    </Page>
  );
}

/** Two sections' worth of placeholder rows, keyed for good. */
const SHELL_SECTIONS = [
  { key: "lists", rows: ["l1", "l2"] },
  { key: "logs", rows: ["g1", "g2", "g3"] },
] as const;

/** A profile's shape while it loads (X24): the header, the card, sections. */
export function FriendProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <ShellBlocks className="flex items-center gap-4">
        <Skeleton className="size-16 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-7 w-[55%]" />
          <Skeleton className="h-4 w-[40%]" />
        </div>
      </ShellBlocks>
      <Skeleton className="h-24 w-full rounded-lg" />
      {SHELL_SECTIONS.map((section) => (
        <ShellBlocks key={section.key} className="flex flex-col gap-2">
          <Skeleton className="h-5 w-20" />
          {section.rows.map((row) => (
            <Skeleton key={row} className="h-16 w-full rounded-lg" />
          ))}
        </ShellBlocks>
      ))}
    </div>
  );
}

/** `/users/[id]` while it loads (X24). */
export function FriendProfileShell() {
  return (
    <LoadingShell label="this profile">
      <Page wide>
        <AppBar parent="/friends" />
        <FriendProfileSkeleton />
      </Page>
    </LoadingShell>
  );
}
