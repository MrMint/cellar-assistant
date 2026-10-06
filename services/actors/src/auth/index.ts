// `authSchema` used to live in `./schema.ts`. X2 moved better-auth's five
// tables into `packages/db` with the rest of the schema, so they are now
// ordinary `public` tables in the one database; re-exported here so importers
// of this barrel do not have to know that.
export { authSchema } from "@cellar-assistant/db";
export { type AuthInstance, createAuth, tokenRole } from "./auth.ts";
export { type AuthConfig, readAuthConfig } from "./config.ts";
export { type AuthDb, makeAuthDb } from "./db.ts";
export {
  type ClassifiedJwk,
  classifyJwks,
  JWKS_GRACE_PERIOD_SECONDS,
  type JwkState,
  jwksStatus,
  promoteStandby,
  publishStandby,
  retireKeys,
  STANDBY_SOAK_SECONDS,
  TOKEN_TTL_SECONDS,
} from "./jwks-rotation.ts";
export { AUTH_BASE_PATH, createAppWithAuth } from "./mount.ts";
export { createPassword, isBcryptHash } from "./password.ts";
