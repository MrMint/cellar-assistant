import { redirect } from "next/navigation";
import { SignInClient } from "@/components/auth/SignInClient";
import { getOptionalServerUser } from "@/utilities/auth-server";
import { sanitizeReturnTo } from "@/utilities/sanitize-return-to";

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo: rawReturnTo } = await searchParams;
  const returnTo = sanitizeReturnTo(rawReturnTo);

  // If user is already authenticated, redirect to intended destination
  const user = await getOptionalServerUser();
  if (user) {
    redirect(returnTo ?? "/cellars");
  }

  return <SignInClient returnTo={returnTo} />;
}
