/**
 * The five typed errors §8.3 names, as GraphQL object types.
 *
 * They are registered against the **classes** from `@cellar-assistant/contracts`,
 * so `plugin-errors` can match a thrown error to its type with `instanceof`.
 * That is why `dapr.ts` reconstructs the class from the wire envelope instead
 * of passing the plain object through.
 */
import {
  ACTOR_ERROR_CODES,
  ACTOR_ERROR_REASONS,
  type ActorError,
  BudgetExceededError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@cellar-assistant/contracts";
import { builder } from "./builder.ts";

export const ErrorInterface = builder.interfaceRef<Error>("Error").implement({
  description: "Anything a client can be told about and act on.",
  fields: (t) => ({
    message: t.exposeString("message"),
  }),
});

/**
 * The five codes, as an enum rather than a `String!`.
 *
 * Built from the same `ACTOR_ERROR_CODES` constant the actors throw with and
 * `parseActorErrorPayload` checks against, so the SDL cannot drift from the
 * wire: an envelope whose `code` is not one of these is never reconstructed as
 * a typed error in the first place (`packages/contracts/src/errors.ts`), which
 * is what makes serialising through an enum safe — there is no value that
 * could reach this field and fail to serialise.
 *
 * On the wire nothing changes: an enum serialises as its name, and the names
 * are the strings `code` always carried. What changes is the client's type —
 * gql.tada now gives `code` as the union of five literals, so a comparison
 * against a misspelt or retired code is a compile error instead of a branch
 * that silently never runs.
 */
export const ActorErrorCodeEnum = builder.enumType("ActorErrorCode", {
  description:
    "The coarse classification every ActorError carries. Fixed by plan §8.3; " +
    "a new value would be a breaking change, unlike `ActorErrorReason`.",
  values: ACTOR_ERROR_CODES,
});

/**
 * The finer discriminator, for the cases where one `code` covers several
 * outcomes a client must branch on. Nullable, and null on most errors.
 */
export const ActorErrorReasonEnum = builder.enumType("ActorErrorReason", {
  description:
    "A stable sub-classification of an ActorError, for the cases where `code` " +
    "alone is too coarse to act on. Additive: new values may appear, so treat " +
    "an unrecognised one as if `reason` were null and fall back to `code`.",
  values: ACTOR_ERROR_REASONS,
});

/** Carries the machine-readable code actors throw with. */
const ActorErrorInterface = builder
  .interfaceRef<ActorError>("ActorError")
  .implement({
    interfaces: [ErrorInterface],
    fields: (t) => ({
      code: t.expose("code", {
        type: ActorErrorCodeEnum,
        description:
          "What kind of refusal this is. Branch on `reason` first when it is " +
          "set, then on this; never on `message`.",
      }),
      /**
       * Never parse `message` to tell two errors apart — that is what this is
       * for. `sendFriendRequest`, for one, has three distinct CONFLICTs.
       */
      reason: t.field({
        type: ActorErrorReasonEnum,
        nullable: true,
        description:
          "Machine-readable discriminator within `code`, or null when `code` " +
          "says everything there is to say. Switch on this, never on `message`.",
        resolve: (error) => error.reason,
      }),
    }),
  });

const errorType = (
  errorClass: new (message: string) => ActorError,
  name: string,
  description: string,
) => {
  builder.objectType(errorClass, {
    name,
    description,
    /**
     * Both interfaces, not just `ActorError`. The GraphQL spec requires an
     * object to declare every transitively implemented interface, and neither
     * Pothos nor `printSchema` checks it — `assertValidSchema` does, which is
     * why `print.ts` runs it before writing the file.
     */
    interfaces: [ActorErrorInterface, ErrorInterface],
    fields: () => ({}),
  });
};

errorType(
  NotFoundError,
  "NotFoundError",
  "The row does not exist, or the viewer may not learn that it does.",
);
errorType(
  ForbiddenError,
  "ForbiddenError",
  "A policy function in packages/policy said no.",
);
errorType(
  ConflictError,
  "ConflictError",
  "A unique constraint, an optimistic-concurrency check, or a state machine.",
);
errorType(
  ValidationError,
  "ValidationError",
  "Input the actor rejected before touching the database.",
);
errorType(
  BudgetExceededError,
  "BudgetExceededError",
  "BudgetActor.reserve denied a paid external call.",
);
