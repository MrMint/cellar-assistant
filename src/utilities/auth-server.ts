import type { Session } from "@nhost/nhost-js/auth";
import { redirect } from "next/navigation";
import * as React from "react";
import { createNhostClient } from "@/lib/nhost/server";

export interface ServerUser {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

/**
 * Convert Nhost session user data to our ServerUser format
 */
function mapSessionToServerUser(session: Session | null): ServerUser | null {
  if (!session?.user?.id) {
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email || "",
    displayName: session.user.displayName || undefined,
    avatarUrl: session.user.avatarUrl || undefined,
  };
}

/**
 * Get user session from Nhost SDK
 * Token validation is handled by middleware - we just retrieve the session here
 */
async function getSessionFromNhost(): Promise<Session | null> {
  try {
    const nhost = await createNhostClient();
    return nhost.getUserSession();
  } catch (error) {
    console.error("Failed to get Nhost session:", error);
    return null;
  }
}

/**
 * Get the current user from server-side context
 * Uses new Nhost SDK for authentication
 */
export async function getServerUser(): Promise<ServerUser> {
  const session = await getSessionFromNhost();
  const user = mapSessionToServerUser(session);

  if (!user) {
    redirect("/sign-in");
  }

  return user;
}

/**
 * Get the current user ID from server-side context
 * Redirects to sign-in if not authenticated
 */
export async function getServerUserId(): Promise<string> {
  const user = await getServerUser();
  return user.id;
}

/**
 * Check if user is authenticated on server-side
 * Returns null if not authenticated (doesn't redirect)
 */
export async function getOptionalServerUser(): Promise<ServerUser | null> {
  const session = await getSessionFromNhost();
  return mapSessionToServerUser(session);
}

/**
 * Higher-order component for protecting server components
 * Uses new Nhost SDK for authentication
 */
export function withAuthAsync<P extends {}>(
  Component: React.ComponentType<P & { user: ServerUser }>,
): React.ComponentType<P> {
  return async function ProtectedServerComponent(props: P) {
    const user = await getServerUser();
    return React.createElement(Component, { ...props, user } as P & {
      user: ServerUser;
    });
  };
}

/**
 * Get the access token from server-side session
 * Used for passing to client components that need to make authenticated storage requests
 */
export async function getServerAccessToken(): Promise<string | null> {
  const session = await getSessionFromNhost();
  return session?.accessToken ?? null;
}
