import { redirect } from "next/navigation";
import { getOptionalServerUser } from "@/utilities/auth-server";

/**
 * `/` — Home (X01, decision D1), and the one place every landing goes:
 * sign-in and sign-up (password and social, `HOME_PATH`), and the installed
 * app's `start_url` (`manifest.ts`).
 *
 * Until X10 gives Home a page of its own ("Today"), it shows today's search
 * page, so a landing never waits on a screen that does not exist yet. The
 * Home tab lights for both (`nav.ts`).
 */
export default async function Home() {
  const user = await getOptionalServerUser();
  redirect(user ? "/search" : "/sign-in");
}
