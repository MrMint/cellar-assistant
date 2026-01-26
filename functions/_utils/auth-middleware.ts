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
 * Extracts and validates user from Hasura session variables or request body
 * @param req Express request object
 * @returns AuthResult with user info or error
 */
export function extractAuthenticatedUser(req: Request): AuthResult {
  // First check for Hasura session variables in headers
  const hasuraUserId = req.headers["x-hasura-user-id"];
  const hasuraRole = req.headers["x-hasura-role"];

  if (typeof hasuraUserId === "string" && hasuraUserId.trim()) {
    return {
      userId: hasuraUserId,
      role: typeof hasuraRole === "string" ? hasuraRole : "user",
      isAuthenticated: true,
    };
  }

  // Check for session variables in request body (Hasura action format)
  const sessionVars = req.body?.session_variables;
  if (sessionVars && typeof sessionVars["x-hasura-user-id"] === "string") {
    return {
      userId: sessionVars["x-hasura-user-id"],
      role: sessionVars["x-hasura-role"] || "user",
      isAuthenticated: true,
    };
  }

  // Check for userId in request body (legacy format)
  const bodyUserId = req.body?.userId;
  if (typeof bodyUserId === "string" && bodyUserId.trim()) {
    return {
      userId: bodyUserId,
      role: "user",
      isAuthenticated: true,
    };
  }

  return {
    isAuthenticated: false,
    error: "No valid user authentication found",
  };
}

/**
 * Validates that a request has valid authentication (either webhook or user)
 * @param req Express request object
 * @returns true if authenticated via webhook/admin, or has valid user session
 */
export function requireAuth(req: Request): AuthResult {
  // Check webhook/admin auth first
  if (validateAuth(req)) {
    // For webhook/admin auth, still try to extract user info if available
    const userResult = extractAuthenticatedUser(req);
    if (userResult.isAuthenticated) {
      return userResult;
    }
    // Webhook auth without user - create admin user
    return {
      userId: "system",
      role: "admin",
      isAuthenticated: true,
    };
  }

  // Otherwise require user authentication
  return extractAuthenticatedUser(req);
}
