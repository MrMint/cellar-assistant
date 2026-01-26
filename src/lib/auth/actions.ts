"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createNhostClient } from "@/lib/nhost/server";

export async function revalidateAfterAuthChange() {
  revalidatePath("/", "layout");
}

export async function signOut() {
  const nhost = await createNhostClient();
  const session = nhost.getUserSession();

  if (session?.refreshToken) {
    await nhost.auth.signOut({ refreshToken: session.refreshToken }, {});
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signIn(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    throw new Error("Email and password are required");
  }

  const nhost = await createNhostClient();

  try {
    const result = await nhost.auth.signInEmailPassword({ email, password });

    if (result.body?.mfa) {
      // Handle MFA - for now redirect to a MFA page (you can implement this later)
      redirect("/signin/mfa");
    }

    if (result.body?.session) {
      // Manually ensure the session is stored in cookies
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      const sessionData = JSON.stringify(result.body.session);

      cookieStore.set("nhostSession", sessionData, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: "/",
      });

      revalidatePath("/", "layout");
      redirect("/cellars");
    }

    throw new Error("Sign in failed - no session created");
  } catch (error) {
    console.error("Sign in error:", error);
    throw error;
  }
}

export async function signUp(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    throw new Error("Email and password are required");
  }

  const nhost = await createNhostClient();

  try {
    const result = await nhost.auth.signUpEmailPassword({ email, password });

    if (result.body?.session) {
      revalidatePath("/", "layout");
      redirect("/cellars");
    }

    // Default success case - user needs to verify email
    redirect("/verify");
  } catch (error) {
    console.error("Sign up error:", error);
    throw error;
  }
}

export async function getProviderSignInUrl(
  provider: "google" | "discord" | "facebook",
) {
  const nhost = await createNhostClient();

  try {
    const url = nhost.auth.signInProviderURL(provider, {
      redirectTo: "/cellars",
    });
    return url;
  } catch (error) {
    console.error("Provider sign-in URL error:", error);
    throw new Error("Failed to generate sign-in URL");
  }
}
