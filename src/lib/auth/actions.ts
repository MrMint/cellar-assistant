"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE_CONFIG,
  SESSION_COOKIE_NAME,
  createNhostClient,
} from "@/lib/nhost/server";
import { sanitizeReturnTo } from "@/utilities/sanitize-return-to";

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
  const returnTo =
    sanitizeReturnTo(formData.get("returnTo") as string) ?? "/search";

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
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      cookieStore.set(
        SESSION_COOKIE_NAME,
        JSON.stringify(result.body.session),
        SESSION_COOKIE_CONFIG,
      );

      revalidatePath("/", "layout");
      redirect(returnTo);
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
      redirect("/search");
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
  origin: string,
  returnTo?: string,
) {
  const nhost = await createNhostClient();
  const destination = sanitizeReturnTo(returnTo) ?? "/search";

  try {
    const url = nhost.auth.signInProviderURL(provider, {
      redirectTo: `${origin}${destination}`,
    });
    return url;
  } catch (error) {
    console.error("Provider sign-in URL error:", error);
    throw new Error("Failed to generate sign-in URL");
  }
}
