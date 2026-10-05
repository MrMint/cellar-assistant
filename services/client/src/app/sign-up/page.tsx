import { redirect } from "next/navigation";
import { SignUpApiClient } from "@/components/auth/SignUpApiClient";
import { getOptionalServerUser } from "@/utilities/auth-server";

/** D2: better-auth sign-up. See `sign-in/page.tsx`. */
export default async function SignUp() {
  const user = await getOptionalServerUser();
  if (user) {
    redirect("/cellars");
  }

  return <SignUpApiClient />;
}
