import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/api/auth-server";
import { REQUEST_PATH_HEADER } from "@/lib/auth/request-path";
import { withReturnTo } from "@/utilities/sanitize-return-to";

/**
 * The viewer, for server components that only need identity.
 *
 * `getServerSession()` is the only source. Accounts imported in the 2026-10
 * migration kept their uuids, so `ServerUser.id` means the same thing it always
 * did.
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

/**
 * As {@link getOptionalServerUser}, but redirects to `/sign-in` instead of
 * returning null — carrying the page asked for as `returnTo`, which the proxy
 * stamped on the request (`lib/auth/request-path.ts`; D19, X17).
 */
export async function getServerUser(): Promise<ServerUser> {
  const user = await getOptionalServerUser();

  if (!user) {
    const asked = (await headers()).get(REQUEST_PATH_HEADER);
    redirect(withReturnTo("/sign-in", asked));
  }

  return user;
}
