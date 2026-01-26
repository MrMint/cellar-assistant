/**
 * Centralized cookie configuration for authentication tokens
 */

export interface CookieConfig {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  path: string;
  maxAge: number;
}

/**
 * Get cookie configuration for access tokens (short-lived)
 */
export function getAccessTokenCookieConfig(): CookieConfig {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60, // 15 minutes
  };
}

/**
 * Get cookie configuration for refresh tokens (long-lived)
 */
export function getRefreshTokenCookieConfig(): CookieConfig {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  };
}

/**
 * Cookie names for authentication tokens
 */
export const COOKIE_NAMES = {
  ACCESS_TOKEN: "nhostAccessToken",
  REFRESH_TOKEN: "nhostRefreshToken",
} as const;
