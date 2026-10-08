import { AppShell } from "@/components/shell/AppShell";
import { getServerUser } from "@/utilities/auth-server";

export const dynamic = "force-dynamic";

/**
 * The signed-in shell, and the one GraphQL client behind every page in it.
 *
 * D2–D8 each mounted `ApiUrqlProvider` on their own route group, because the
 * root layout still carried the Hasura client and URQL's provider is React
 * context — the innermost one won, which is what let one group migrate without
 * waiting for the others. That cost seventeen near-identical `layout.tsx`
 * files, two in-page mounts, and **a separate client (and therefore a separate
 * graphcache) per group**, so a mutation on one page could not update a
 * normalised entity another page had cached.
 *
 * D9 deleted the Hasura client, so there is nothing left to shadow: one
 * provider here covers every authenticated route with one cache. Nothing
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
  // Server-side authentication check — redirects to /sign-in if not authenticated.
  const user = await getServerUser();

  return <AppShell user={user}>{children}</AppShell>;
}
