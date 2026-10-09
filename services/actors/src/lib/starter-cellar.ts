/**
 * N15's starter cellar: the address it lives at, shared by the module that
 * asks for it (better-auth's `user.create` hook, `../auth/auth.ts`) and the
 * actor that makes it (`CellarActor.createStarter`). Here, in `lib/`, because
 * an actor module and the auth module cannot import each other.
 *
 * The id is derived from the new user's id, so the outbox's at-least-once
 * delivery converges on one cellar however many times it runs, and
 * `createStarter` can refuse a row whose target id was not derived from the
 * owner it names.
 */
import { derivedUuid } from "./derived-uuid.ts";

const NAMESPACE = "cellar-assistant:starter-cellar";

/** The starter cellar's id for `userId`. Stable across processes. */
export const starterCellarId = (userId: string): string =>
  derivedUuid(NAMESPACE, userId);
