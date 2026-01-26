import { redirect } from "next/navigation";
import { SignUpClient } from "@/components/auth/SignUpClient";
import { getOptionalServerUser } from "@/utilities/auth-server";

export default async function SignUp() {
  // If user is already authenticated, redirect to cellars
  const user = await getOptionalServerUser();
  if (user) {
    redirect("/cellars");
  }

  return <SignUpClient />;
}
