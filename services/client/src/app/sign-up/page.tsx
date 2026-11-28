import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignUpApiClient } from "@/components/auth/SignUpApiClient";
import { readPasswordMode } from "@/lib/auth/password-mode";
import { getOptionalServerUser } from "@/utilities/auth-server";
import { HOME_PATH, sanitizeReturnTo } from "@/utilities/sanitize-return-to";

export const metadata: Metadata = { title: "Sign up" };

/**
 * D2: better-auth sign-up. See `sign-in/page.tsx`.
 *
 * Takes the same `returnTo` as sign-in (D19): a viewer sent to `/sign-in` from
 * a shared link who signs up instead — by password or through a provider —
 * still ends up on that link.
 */
export default async function SignUp({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo: rawReturnTo } = await searchParams;
  const returnTo = sanitizeReturnTo(rawReturnTo);

  const user = await getOptionalServerUser();
  if (user) {
    redirect(returnTo ?? HOME_PATH);
  }

  return (
    <SignUpApiClient returnTo={returnTo} passwordMode={readPasswordMode()} />
  );
}
