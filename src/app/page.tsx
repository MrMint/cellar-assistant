import { redirect } from "next/navigation";
import { getOptionalServerUser } from "@/utilities/auth-server";

export default async function Home() {
  // Check if user is authenticated
  const user = await getOptionalServerUser();

  if (user) {
    // User is authenticated, redirect to cellars
    redirect("/cellars");
  } else {
    // User is not authenticated, redirect to sign-in
    redirect("/sign-in");
  }
}
