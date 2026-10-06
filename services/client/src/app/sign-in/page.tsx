import { redirect } from "next/navigation";
import { SignInApiClient } from "@/components/auth/SignInApiClient";
import { readPasswordMode } from "@/lib/auth/password-mode";
import { getOptionalServerUser } from "@/utilities/auth-server";
import { sanitizeReturnTo } from "@/utilities/sanitize-return-to";

/**
 * Sign-in against **better-auth** (`SignInApiClient`).
 *
 * A viewer who already has a session is redirected away rather than shown a
 * form: signing in a second time would mint a second session row for no reason,
 * and `returnTo` is where they were actually trying to go.
 */
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo: rawReturnTo } = await searchParams;
  const returnTo = sanitizeReturnTo(rawReturnTo);

  const user = await getOptionalServerUser();
  if (user) {
    redirect(returnTo ?? "/cellars");
  }

  return (
    <SignInApiClient returnTo={returnTo} passwordMode={readPasswordMode()} />
  );
}
