/**
 * The "never trust the client's done" gate, in one place (E2d).
 *
 * A8's upload protocol is three calls and a PUT: `createUploadTarget` mints the
 * `files` row *before any bytes move*, the browser PUTs to the presigned URL,
 * and `FileActor.verify` asks the object store whether the object is actually
 * there — which is the only step a server can trust, and the only thing that
 * sets `files.verified_at`. `files_unverified_idx` exists so `MaintenanceActor`
 * can reap the rows where that never happened.
 *
 * So **a bare file id proves nothing**: it proves a row was minted, not that
 * bytes exist behind it. Any method that stores a caller-supplied file id has to
 * consult verification first, and E2d found that three of them did not.
 *
 * ## Why a shared module rather than a copy per actor
 *
 * `ItemActor.attachImage` had the only correct implementation, as a private
 * `VerifyFile` seam plus a `verifiedAt === null` check. `MenuScanActor` could
 * not simply import it. `no-external-calls.test.ts` pins `item-actor.ts`'s
 * import list and no other actor module is on it, so the seam would have had to
 * move anyway — and importing an actor module for one function pulls in that
 * actor's whole dependency surface, `EmbeddingActor` edge included, which is
 * precisely the pressure that left `derivedUuid` as three copies, two of which
 * agreed. `src/lib/` has neither problem, so the seam lives here and every
 * actor that needs it injects the same one.
 *
 * ## Why it goes through `FileActor.verify` and not a `select verified_at`
 *
 * Reading the column only proves somebody called `verifyUpload` earlier.
 * `FileActor.verify` reads the column *and*, when it is null, asks the binding —
 * so a client that PUT the bytes and skipped `verifyUpload` still succeeds
 * (its call sets `verified_at` on the way through, which is the self-healing
 * half), while a client that merely minted a target is refused. §8.5 sanctions
 * the entity → `FileActor` edge for precisely this.
 */
import type { Ctx, FileDto } from "@cellar-assistant/contracts";
import {
  ConflictError,
  FileActorDescriptor,
} from "@cellar-assistant/contracts";
import { internal } from "./internal-client.ts";

/**
 * `FileActor.verify`, as an injectable function — the no-Dapr test harness has
 * no sidecar, so every caller takes this in its constructor with
 * `daprVerifyFile` as the default.
 */
export type VerifyFile = (
  ctx: Ctx,
  fileId: string,
) => Promise<{ readonly id: string; readonly verifiedAt: string | null }>;

/**
 * Bounded by `FileActorDescriptor`'s 30s for `verify`: the binding's `stat` is
 * one round trip to the object store, and this sits in a user-facing
 * mutation's turn.
 */
export const daprVerifyFile: VerifyFile = async (ctx, fileId) => {
  // Typed by the contract, and still read defensively: `requireVerifiedFile`
  // treats anything but a string as "not verified", which is the safe answer
  // for a body that arrived as JSON.
  const row: Partial<FileDto> | null = await internal(ctx)(
    FileActorDescriptor,
    fileId,
  ).verify();
  const verifiedAt: unknown = row?.verifiedAt;
  return {
    id: fileId,
    verifiedAt: typeof verifiedAt === "string" ? verifiedAt : null,
  };
};

/**
 * Refuse a file whose bytes were never uploaded.
 *
 * `FileActor.verify` already throws `ConflictError` when the object is missing,
 * so the `null` branch here is the belt to that braces: a seam stubbed in a test
 * — or a future `verify` that reports rather than throws — must not be able to
 * wave an unverified id through. Both paths raise `ConflictError`, which
 * `services/api` renders as a typed error member rather than a 500.
 *
 * @param what names the caller in the message, e.g. `"a menu scan"`.
 */
export const requireVerifiedFile = async (
  verify: VerifyFile,
  ctx: Ctx,
  fileId: string,
  what: string,
): Promise<void> => {
  const file = await verify(ctx, fileId);
  if (file.verifiedAt === null) {
    throw new ConflictError(
      `file ${fileId} is not verified: its upload has not completed, so it ` +
        `cannot be used for ${what} yet`,
    );
  }
};
