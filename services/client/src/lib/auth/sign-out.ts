"use server";

import { revalidatePath } from "next/cache";

/**
 * The server half of signing out.
 *
 * better-auth's session is ended by the browser's own `POST /api/auth/sign-out`
 * (see `authClient.signOut()`): the proxy passes the response's `Set-Cookie`
 * straight through, so the cookie is cleared by the response the browser
 * received. What is left is **the router cache** — every `(authenticated)`
 * layout was server-rendered with a user in it, and without this the next
 * navigation would replay that render from cache and show a signed-in shell
 * around a signed-out session.
 */
export async function completeSignOut(): Promise<void> {
  revalidatePath("/", "layout");
}
