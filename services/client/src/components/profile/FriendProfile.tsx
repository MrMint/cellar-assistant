import { AppBar } from "@/components/app/AppBar";
import { EmptyState } from "@/components/app/EmptyState";
import { People } from "@/components/app/icons";
import { LoadingShell, ShellBlocks } from "@/components/app/LoadingShell";
import { Page } from "@/components/app/Page";
import { UserAvatar } from "@/components/app/UserAvatar";
import { TasteCompareSection } from "@/components/taste/TasteCompareSection";
import { Skeleton } from "@/components/ui/skeleton";
import { type FriendProfileView, sharesNothing } from "./adapter";
import { FriendLog } from "./FriendLog";
import { FriendCellars, FriendTierLists } from "./FriendSections";

/**
 * `/users/[id]` — a friend's read-only profile (X18): who, since when, then
 * what they share with you — their tier lists you may open, their cellars
 * you may open, and their drink log. Nothing here edits anything; the one
 * thing to do is open what they shared.
 *
 * A section with nothing in it is not drawn (D2's rule for other people's
 * sections), and a friend who shares nothing at all gets one empty state
 * rather than three empty boxes. The privacy rules are the API's; this only
 * draws what came back.
 */
export function FriendProfile({ view }: { view: FriendProfileView }) {
  return (
    <Page>
      <AppBar parent="/friends" />
      <header className="flex items-center gap-4 px-1">
        {/* Decorative: the name is the heading beside it. */}
        <UserAvatar
          aria-hidden
          avatarUrl={view.avatarUrl}
          displayName={view.name}
          size="lg"
          className="size-16 text-2xl"
        />
        <div className="flex min-w-0 flex-col">
          <h1 className="type-title-1 truncate">{view.name}</h1>
          <p className="type-footnote truncate">{view.sinceLine}</p>
        </div>
      </header>

      {/* L03, L30: agreement as a count, and their lists to copy. A slot:
          nothing until it has its own answer. */}
      <TasteCompareSection
        userId={view.userId}
        lists={view.tierLists.rows.map(({ id, name }) => ({ id, name }))}
      />

      {sharesNothing(view) ? (
        <EmptyState
          illustration={<People aria-hidden strokeWidth={1.5} />}
          title="Nothing shared yet."
          description={`When ${view.name} ranks a list, opens a cellar to friends or logs a drink, it shows up here.`}
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
            <FriendLog userId={view.userId} initialPage={view.logs} />
          )}
        </>
      )}
    </Page>
  );
}

/** Two sections' worth of placeholder rows, keyed for good. */
const SHELL_SECTIONS = [
  { key: "lists", rows: ["l1", "l2", "l3"] },
  { key: "logs", rows: ["g1", "g2", "g3", "g4"] },
] as const;

/** `/users/[id]` while it loads (X24): the header and two sections' shapes. */
export function FriendProfileShell() {
  return (
    <LoadingShell label="this profile">
      <Page>
        <AppBar parent="/friends" />
        <ShellBlocks className="flex items-center gap-4 px-1">
          <Skeleton className="size-16 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-7 w-[55%]" />
            <Skeleton className="h-4 w-[40%]" />
          </div>
        </ShellBlocks>
        {SHELL_SECTIONS.map((section) => (
          <ShellBlocks key={section.key} className="flex flex-col gap-2">
            <Skeleton className="mx-4 h-3 w-20" />
            <div className="flex flex-col gap-px overflow-hidden rounded-lg">
              {section.rows.map((row) => (
                <Skeleton key={row} className="h-14 w-full rounded-none" />
              ))}
            </div>
          </ShellBlocks>
        ))}
      </Page>
    </LoadingShell>
  );
}
