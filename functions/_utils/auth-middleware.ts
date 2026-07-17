import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";

/**
 * Performs a timing-safe string comparison to prevent timing attacks
 * @param a First string to compare
 * @param b Second string to compare
 * @returns boolean indicating if strings are equal
 */
function secureCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");

    // If lengths differ, still perform comparison to maintain constant time
    // but use a dummy buffer for the shorter one
    if (bufA.length !== bufB.length) {
      // Compare against itself to maintain timing, then return false
      timingSafeEqual(bufA, bufA);
      return false;
    }

    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Configuration validation result
 */
export interface AuthConfigValidation {
  isValid: boolean;
  missingSecrets: string[];
  warnings: string[];
}

// Track if configuration warning has been logged to avoid spam
let configWarningLogged = false;

/**
 * Validates that required auth environment variables are configured
 * Call this at startup to catch configuration issues early
 * @returns validation result with details about missing configuration
 */
export function validateAuthConfig(): AuthConfigValidation {
  const result: AuthConfigValidation = {
    isValid: true,
    missingSecrets: [],
    warnings: [],
  };

  if (!process.env.NHOST_WEBHOOK_SECRET) {
    result.missingSecrets.push("NHOST_WEBHOOK_SECRET");
    result.warnings.push(
      "Webhook authentication will fail without NHOST_WEBHOOK_SECRET",
    );
  }

  if (!process.env.NHOST_ADMIN_SECRET) {
    result.missingSecrets.push("NHOST_ADMIN_SECRET");
    result.warnings.push(
      "Admin authentication will fail without NHOST_ADMIN_SECRET",
    );
  }

  result.isValid = result.missingSecrets.length === 0;

  // Log warning once per process
  if (!result.isValid && !configWarningLogged) {
    console.error(
      "🚨 [Auth] Missing required secrets:",
      result.missingSecrets.join(", "),
    );
    for (const warning of result.warnings) {
      console.warn(`⚠️ [Auth] ${warning}`);
    }
    configWarningLogged = true;
  }

  return result;
}

/**
 * Validates webhook authentication using NHOST_WEBHOOK_SECRET
 * @param req Express request object
 * @returns boolean indicating if authentication is valid
 */
export function validateWebhookAuth(req: Request): boolean {
  const receivedSecret = req.headers["nhost-webhook-secret"];
  const expectedSecret = process.env.NHOST_WEBHOOK_SECRET;

  if (!expectedSecret) {
    // Log detailed error only once, then just return false
    if (!configWarningLogged) {
      console.error(
        "🚨 [Auth] NHOST_WEBHOOK_SECRET not configured - webhook auth will fail",
      );
      configWarningLogged = true;
    }
    return false;
  }

  if (typeof receivedSecret !== "string") {
    return false;
  }

  return secureCompare(receivedSecret, expectedSecret);
}

/**
 * Validates admin authentication using NHOST_ADMIN_SECRET
 * @param req Express request object
 * @returns boolean indicating if authentication is valid
 */
export function validateAdminAuth(req: Request): boolean {
  const receivedSecret = req.headers["x-hasura-admin-secret"];
  const expectedSecret = process.env.NHOST_ADMIN_SECRET;

  if (!expectedSecret) {
    // Log detailed error only once, then just return false
    if (!configWarningLogged) {
      console.error(
        "🚨 [Auth] NHOST_ADMIN_SECRET not configured - admin auth will fail",
      );
      configWarningLogged = true;
    }
    return false;
  }

  if (typeof receivedSecret !== "string") {
    return false;
  }

  return secureCompare(receivedSecret, expectedSecret);
}

/**
 * Validates either webhook or admin authentication
 * @param req Express request object
 * @returns boolean indicating if authentication is valid
 */
export function validateAuth(req: Request): boolean {
  return validateWebhookAuth(req) || validateAdminAuth(req);
}

/**
 * Standard authentication error response
 */
export const AUTH_ERROR_RESPONSE = {
  error: "Unauthorized",
  message: "Invalid authentication credentials",
};

/**
 * Result of extracting user info from request
 */
export interface AuthenticatedUser {
  userId: string;
  role: string;
  isAuthenticated: true;
}

export interface UnauthenticatedResult {
  isAuthenticated: false;
  error: string;
}

export type AuthResult = AuthenticatedUser | UnauthenticatedResult;

/**
 * Extracts the end-user identity from Hasura session variables.
 *
 * Session variables are the only trustworthy source of identity: Hasura derives
 * them from the verified JWT and delivers them in the request body via the
 * action's Kriti request transform. Request headers are NOT a source of
 * identity — actions run with `forward_client_headers: true`, so an inbound
 * `x-hasura-user-id` header is whatever the client chose to send.
 *
 * This does not authenticate the caller. It only reads the identity a caller
 * already proven trustworthy (see requireAuth) is asserting.
 *
 * @param req Express request object
 * @returns AuthResult with user info or error
 */
export function extractAuthenticatedUser(req: Request): AuthResult {
  const sessionVars: unknown = req.body?.session_variables;

  if (typeof sessionVars === "object" && sessionVars !== null) {
    const vars = sessionVars as Record<string, unknown>;
    const userId = vars["x-hasura-user-id"];
    const role = vars["x-hasura-role"];

    if (typeof userId === "string" && userId.trim()) {
      return {
        userId,
        role: typeof role === "string" && role.trim() ? role : "user",
        isAuthenticated: true,
      };
    }
  }

  return {
    isAuthenticated: false,
    error: "No Hasura session variables found in request body",
  };
}

/**
 * Requires a trusted caller (webhook or admin secret) AND an end-user identity
 * from Hasura session variables. Fails closed on either.
 *
 * Only use this for handlers that need to act as a specific user. Handlers that
 * merely need to prove the request came from Hasura or another trusted service
 * should call validateAuth() directly.
 *
 * Note that the request transform of the calling action must forward
 * session variables, e.g. `"session_variables": {{$body?.session_variables}}`.
 *
 * @param req Express request object
 * @returns AuthResult with user info or error
 */
export function requireAuth(req: Request): AuthResult {
  if (!validateAuth(req)) {
    return {
      isAuthenticated: false,
      error: "Invalid authentication credentials",
    };
  }

  return extractAuthenticatedUser(req);
}
