import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/api/auth-server";

/**
 * The viewer, for server components that only need identity.
 *
 * D2 added better-auth here as a *fallback* behind the Nhost session, so a
 * viewer still holding a live `nhostSession` kept seeing what they saw before.
 * D9 removed the Nhost half: `getServerSession()` is now the only source, and a
 * pre-migration `nhostSession` cookie means nothing to this app.
 *
 * The ids agree across that change — A6 migrated Nhost's `auth.users.id` (a
 * uuid) into better-auth unchanged, so `ServerUser.id` means the same thing it
 * always did.
 *
 * A page that is going to query GraphQL anyway does not need this: `me` on the
 * API answers from the token's own claims, in the same round trip. Use it for
 * gates that must decide before rendering.
 */
export interface ServerUser {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

/**
 * The current viewer, or `null` when this request is anonymous.
 *
 * A cookie being present proves nothing — this resolves the session against the
 * actors app, which is the only thing that can say whether it is still valid.
 */
export async function getOptionalServerUser(): Promise<ServerUser | null> {
  const session = await getServerSession();
  if (session === null) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.name ?? undefined,
    avatarUrl: session.user.image ?? undefined,
  };
}

/** As {@link getOptionalServerUser}, but redirects to `/sign-in` instead of returning null. */
export async function getServerUser(): Promise<ServerUser> {
  const user = await getOptionalServerUser();

  if (!user) {
    redirect("/sign-in");
  }

  return user;
}
