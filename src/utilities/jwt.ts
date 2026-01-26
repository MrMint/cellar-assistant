import { jwtVerify } from "jose";

// Only log auth details in development to avoid exposing sensitive info in production
const isDev = process.env.NODE_ENV === "development";

/**
 * Verify JWT token with signature validation
 * Returns the payload if valid, null if invalid
 */
export async function verifyJWT(token: string): Promise<any | null> {
  try {
    if (!token || typeof token !== "string" || token.trim().length === 0) {
      return null;
    }

    const secret = process.env.HASURA_GRAPHQL_JWT_SECRET;
    if (!secret) {
      console.error(
        "JWT secret not configured - check HASURA_GRAPHQL_JWT_SECRET environment variable",
      );
      return null;
    }

    // Convert the secret to a Uint8Array for jose
    const secretKey = new TextEncoder().encode(secret);

    // Verify the JWT with signature validation
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ["HS256"],
    });

    return payload;
  } catch (_error) {
    // Invalid token, expired, or verification failed
    // Don't log details to prevent information leakage
    return null;
  }
}

/**
 * Check if JWT token is expired
 * This is a simpler check without signature verification for performance
 */
export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return true;
    }

    const payload = JSON.parse(atob(parts[1]));
    const now = Date.now();
    const exp = payload.exp ? payload.exp * 1000 : null;

    if (isDev && exp) {
      const timeUntilExpiry = exp - now;
      const minutesUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60));
      console.log(
        `⏱️  [JWT] Token expires in ${minutesUntilExpiry} minutes (${new Date(exp).toLocaleTimeString()})`,
      );
    }

    // Check if token is expired (add 30 second buffer)
    const isExpired = exp ? exp < now + 30000 : true;

    if (isDev && isExpired && exp) {
      const expiredAgo = Math.floor((now - exp) / (1000 * 60));
      console.log(`💀 [JWT] Token expired ${expiredAgo} minutes ago`);
    }

    return isExpired;
  } catch {
    return true;
  }
}
