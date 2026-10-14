import { AppBar } from "@/components/app/AppBar";
import { EmptyState } from "@/components/app/EmptyState";
import {
  Cellar,
  ChevronRight,
  ICON_STROKE,
  People,
  Ranked,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { LoadingShell, ShellBlocks } from "@/components/app/LoadingShell";
import { InsetSection, ListRow, Page } from "@/components/app/Page";
import { UserAvatar } from "@/components/app/UserAvatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type FriendProfileView,
  moreLine,
  type ProfileCellarRow,
  type ProfileListRow,
  sharesNothing,
} from "./adapter";
import { FriendLog } from "./FriendLog";

const Chevron = () => (
  <ChevronRight aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
);

/** One row into a tier list or a cellar of theirs. */
function LinkRow({
  row,
  icon: Icon,
}: {
  row: ProfileListRow | ProfileCellarRow;
  icon: typeof Ranked;
}) {
  return (
    <ListRow
      leading={
        <Icon aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
      }
      title={
        <Link href={row.href} overlay underline="none" className="text-ink-1">
          {row.name}
        </Link>
      }
      description={row.description || undefined}
      trailing={<Chevron />}
    />
  );
}

function More({ line }: { line: string | null }) {
  return line === null ? null : (
    <p className="type-footnote px-4 py-2">{line}</p>
  );
}

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

      {sharesNothing(view) ? (
        <EmptyState
          illustration={<People aria-hidden strokeWidth={1.5} />}
          title="Nothing shared yet."
          description={`When ${view.name} ranks a list, opens a cellar to friends or logs a drink, it shows up here.`}
        />
      ) : (
        <>
          {view.tierLists.length > 0 && (
            <InsetSection label="Tier lists" data-section="tier-lists">
              {view.tierLists.map((row) => (
                <LinkRow key={row.id} row={row} icon={Ranked} />
              ))}
              <More
                line={moreLine(view.tierLists.length, view.tierListCount)}
              />
            </InsetSection>
          )}
          {view.cellars.length > 0 && (
            <InsetSection label="Cellars" data-section="cellars">
              {view.cellars.map((row) => (
                <LinkRow key={row.id} row={row} icon={Cellar} />
              ))}
              <More line={moreLine(view.cellars.length, view.cellarCount)} />
            </InsetSection>
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
