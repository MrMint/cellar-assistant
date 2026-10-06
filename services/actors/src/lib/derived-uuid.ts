/**
 * A deterministic uuid — RFC 4122 version 5 in shape (SHA-1 replaced by
 * SHA-256, truncated to 16 bytes) — used across several actors to mint ids
 * that are stable across processes and across redeliveries. C4c (migration
 * plan): this was three near-identical copies — `item-onboarding-actor.ts`,
 * `recipe-photo-job-actor.ts` and `menu-scan-actor.ts` — hoisted here because
 * actor modules cannot import each other without breaking the §1.2
 * containment test, so a genuinely shared helper has to live in `src/lib/`.
 *
 * ## The three copies were not identical
 *
 * `item-onboarding-actor.ts`'s `uuidFrom` and `recipe-photo-job-actor.ts`'s
 * `derivedUuid` both joined `namespace` and `name` with a **NUL byte**
 * (`` `${namespace}\0${name}` ``) — recipe-photo-job-actor.ts's own comment
 * said it was "the same eight lines" as item-onboarding-actor.ts's, i.e. a
 * deliberate copy. `menu-scan-actor.ts`'s `uuidFrom` instead joined them with
 * an **ASCII space** (`` `${namespace} ${name}` ``), with no comment claiming
 * parity with the other two. That is a real behavioural difference — for the
 * same two inputs, the space-separated version produces a different uuid than
 * the NUL-separated one — so this could not be resolved by picking one
 * arbitrarily.
 *
 * **Kept: the NUL-byte separator**, because it is what two of the three
 * copies already agreed on (one of them explicitly as a deliberate copy of
 * the other), and because it is the one B2's `ItemOnboardingActor.confirm`
 * uses to mint `itemId`/`cellarItemId` from an onboarding id — the actually
 * load-bearing case this file's own docs describe as "precisely so a
 * redelivered `confirm` converges". `menu-scan-actor.ts` only ever used its
 * copy to derive a `MenuMatchJobActor` id (a Dapr actor id, not a stored
 * database row id — nothing persists the old value as an expected constant),
 * so moving it onto the NUL-separated formula changes no committed data, only
 * which actor instance a scan's match job addresses from here on.
 *
 * A NUL byte is used (rather than, say, a colon) so that no combination of
 * `namespace`/`name` values containing the separator itself can collide two
 * different logical pairs onto the same joined string.
 */
import { createHash } from "node:crypto";

export const derivedUuid = (namespace: string, name: string): string => {
  const digest = createHash("sha256").update(`${namespace}\0${name}`).digest();
  const bytes = Uint8Array.prototype.slice.call(digest, 0, 16);
  // Version 5, RFC 4122 variant.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
};
