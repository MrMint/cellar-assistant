import { AppShell } from "@/components/shell/AppShell";
import { getServerUser } from "@/utilities/auth-server";

export const dynamic = "force-dynamic";

/**
 * The signed-in shell, and the one GraphQL client behind every page in it.
 *
 * One provider here covers every authenticated route with one cache. A
 * provider per route group would mean **a separate client (and therefore a
 * separate graphcache) per group**, so a mutation on one page could not update
 * a normalised entity another page had cached. Nothing
 * outside this group queries GraphQL — `/sign-in`, `/sign-up`, `/` and
 * `/~offline` talk to better-auth over plain `fetch`, if at all — which is why
 * this sits on the group rather than on the root layout, where it would put a
 * client on the sign-in page for nothing.
 *
 * The markup is `AppShell`, shared with the root `not-found.tsx` so an
 * unmatched URL keeps the tab bar too. This group's own `not-found.tsx` and
 * `error.tsx` render inside it.
 */
export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side authentication check — redirects to /sign-in if not
  // authenticated. The gate runs before any page in the group renders, and
  // hands the shell the viewer's name and picture for the Me avatar.
  const user = await getServerUser();

  return (
    <AppShell
      viewer={{ displayName: user.displayName, avatarUrl: user.avatarUrl }}
    >
      {children}
    </AppShell>
  );
}
