import { redirect } from "next/navigation";
import { SignInClient } from "@/components/auth/SignInClient";
import { getOptionalServerUser } from "@/utilities/auth-server";

export default async function SignIn() {
  // If user is already authenticated, redirect to cellars
  const user = await getOptionalServerUser();
  if (user) {
    redirect("/cellars");
  }

  return <SignInClient />;
}
