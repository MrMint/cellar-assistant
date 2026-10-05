/**
 * The errors actor methods throw, and the only ones `services/api` has to know
 * about. §8.3: "mutations return `<Command>Result` unions via `plugin-errors`:
 * the payload or a typed error (`NotFound`, `Forbidden`, `Conflict`,
 * `Validation`, `BudgetExceeded`)". A7 maps these five classes onto that union;
 * actors throw them, resolvers never construct them.
 *
 * Thrown across the Dapr wire an error arrives as a plain object, so the `code`
 * field — not `instanceof` — is what survives and what A7's mapping reads.
 */
export const ACTOR_ERROR_CODES = [
  "NOT_FOUND",
  "FORBIDDEN",
  "CONFLICT",
  "VALIDATION",
  "BUDGET_EXCEEDED",
] as const;

export type ActorErrorCode = (typeof ACTOR_ERROR_CODES)[number];

/* -------------------------------------------------------------------------- */
/* The optional discriminator                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A stable, machine-readable **sub**-classification, for the cases where one
 * `code` covers several outcomes a client must tell apart.
 *
 * The five codes above are the contract §8.3 fixes and are deliberately coarse.
 * That is fine until a client has to *branch*: `UserActor.sendFriendRequest`
 * has three distinct `CONFLICT`s and a `VALIDATION`, and the frontend was
 * substring-matching the English message to decide whether to show "Send
 * request" or "Accept their request" (D8). A prose match is not an API.
 *
 * `reason` is **additive and optional**: most errors carry `null`, the wire
 * envelope omits it when absent, and a client that ignores it behaves exactly
 * as before. Adding a value to this list is a compatible change; changing or
 * removing one is not — treat each string as permanent once shipped.
 *
 * Values are namespaced by the thing they describe, not by the actor, so the
 * same reason can be thrown from more than one place if the situation is the
 * same one.
 */
export const ACTOR_ERROR_REASONS = [
  /** `sendFriendRequest` to yourself. `VALIDATION`. */
  "CANNOT_FRIEND_SELF",
  /** A `friends` row already exists in one direction or the other. `CONFLICT`. */
  "ALREADY_FRIENDS",
  /** *I* have an open `friend_requests` row to them. `CONFLICT`. */
  "FRIEND_REQUEST_ALREADY_SENT",
  /**
   * *They* have an open `friend_requests` row to me — the case a client turns
   * into an "Accept their request" affordance rather than an error. `CONFLICT`.
   */
  "FRIEND_REQUEST_ALREADY_RECEIVED",

  /* -- recipes (A7d item 8) ---------------------------------------------- */

  /**
   * `RecipeActor.addReview` when the viewer already has a `recipe_reviews` row
   * for this recipe (`recipe_reviews_recipe_id_user_id_key`). `CONFLICT`.
   *
   * The affordance a client turns this into is "edit your review", not a
   * retry — which is precisely why the message said so in English and the
   * frontend had nothing to branch on.
   */
  "REVIEW_ALREADY_EXISTS",
  /**
   * `RecipeActor.updateReview` / `deleteReview` naming a review written by
   * somebody else. `FORBIDDEN`.
   *
   * Distinct from the `NOT_FOUND` raised when the review is not on this recipe
   * at all: that one says "no such review here", this one says "not yours".
   */
  "NOT_REVIEW_AUTHOR",
  /**
   * `RecipeGroupActor.vote` / `removeVote` naming a recipe that is not a
   * member of this group. `NOT_FOUND`.
   *
   * B6's group-scoping check, made branchable: a client that assembled the
   * wrong `(groupId, recipeId)` pair can say so instead of reporting the
   * recipe as missing.
   */
  "RECIPE_NOT_IN_GROUP",
] as const;

export type ActorErrorReason = (typeof ACTOR_ERROR_REASONS)[number];

export const isActorErrorReason = (value: unknown): value is ActorErrorReason =>
  typeof value === "string" &&
  (ACTOR_ERROR_REASONS as readonly string[]).includes(value);

export class ActorError extends Error {
  readonly code: ActorErrorCode;

  /**
   * The finer discriminator, or `null` when the `code` says everything there
   * is to say. Clients switch on this **before** falling back to `code`; they
   * never parse `message`.
   */
  readonly reason: ActorErrorReason | null;

  constructor(
    code: ActorErrorCode,
    message: string,
    reason: ActorErrorReason | null = null,
  ) {
    super(message);
    this.code = code;
    this.reason = reason;
    this.name = new.target.name;
  }
}

/** The aggregate does not exist, or the viewer may not learn that it does. */
export class NotFoundError extends ActorError {
  constructor(message: string, reason?: ActorErrorReason) {
    super("NOT_FOUND", message, reason ?? null);
  }
}

/**
 * A policy function in `@cellar-assistant/policy` said no.
 *
 * Prefer `NotFoundError` where merely knowing the row exists is itself a leak
 * (a PRIVATE cellar, another user's menu scan); use `Forbidden` when the viewer
 * can already see the thing but may not perform this operation on it.
 */
export class ForbiddenError extends ActorError {
  constructor(message: string, reason?: ActorErrorReason) {
    super("FORBIDDEN", message, reason ?? null);
  }
}

/** A unique constraint, an optimistic-concurrency check, or a state machine. */
export class ConflictError extends ActorError {
  constructor(message: string, reason?: ActorErrorReason) {
    super("CONFLICT", message, reason ?? null);
  }
}

/** Input the actor rejected before touching the database. */
export class ValidationError extends ActorError {
  constructor(message: string, reason?: ActorErrorReason) {
    super("VALIDATION", message, reason ?? null);
  }
}

/** `BudgetActor.reserve` denied a paid external call. */
export class BudgetExceededError extends ActorError {
  constructor(message: string, reason?: ActorErrorReason) {
    super("BUDGET_EXCEEDED", message, reason ?? null);
  }
}

export const isActorError = (error: unknown): error is ActorError =>
  error instanceof ActorError;

/* -------------------------------------------------------------------------- */
/* The wire envelope                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The shape an actor must put in a failed invocation's response body for
 * `services/api` to re-raise a *typed* error rather than a generic 500.
 *
 * Actor authors: throw `NotFoundError` &c. and let the actor host's error
 * handler serialize `{ code, message }`. Anything else reaches GraphQL as an
 * unexpected error and is masked.
 *
 * `reason` is the optional fourth field of A7b's envelope: present only when
 * the error carries one, so a reader that does not know about it sees exactly
 * the `{ code, message }` body it saw before.
 */
export type ActorErrorPayload = {
  readonly code: ActorErrorCode;
  readonly message: string;
  readonly reason?: ActorErrorReason;
};

/**
 * The header that carries an envelope across the sidecar (A7b).
 *
 * Dapr's actor protocol signals an *application-level* failure with a response
 * header, **not** a status code — `pkg/actors/targets/app/transport/http`
 * checks `!= 200` and folds the response into `ERR_ACTOR_INVOKE_METHOD`
 * *before* it looks at any header, so an error body only survives the hop when
 * the host answers `200` and sets this. The sidecar then forwards the host's
 * status, content type, body **and this header** verbatim
 * (`pkg/api/http/actors.go`, `onDirectActorMessage`), across the remote hop too
 * (`pkg/actors/router`, `callRemoteActor`).
 *
 * So a caller cannot use `response.ok` alone to decide an invocation failed: a
 * `200` carrying this header is a *failure*, and its body is an
 * `ActorErrorPayload`. Both callers — `services/api/src/dapr.ts` and
 * `services/actors/src/lib/sidecar.ts` — check it; `services/actors/src/lib/actor-error-envelope.ts`
 * is the only thing that sets it.
 *
 * Compared case-insensitively: Go canonicalises it to
 * `X-Daprerrorresponseheader` and `fetch` lowercases on the way back.
 */
export const DAPR_ERROR_RESPONSE_HEADER = "x-daprerrorresponseheader";

const isActorErrorCode = (value: unknown): value is ActorErrorCode =>
  typeof value === "string" &&
  (ACTOR_ERROR_CODES as readonly string[]).includes(value);

const CONSTRUCTORS: Record<
  ActorErrorCode,
  new (
    message: string,
    reason?: ActorErrorReason,
  ) => ActorError
> = {
  NOT_FOUND: NotFoundError,
  FORBIDDEN: ForbiddenError,
  CONFLICT: ConflictError,
  VALIDATION: ValidationError,
  BUDGET_EXCEEDED: BudgetExceededError,
};

export const actorErrorForCode = (
  code: ActorErrorCode,
  message: string,
  reason?: ActorErrorReason,
): ActorError => new CONSTRUCTORS[code](message, reason);

/**
 * Reconstructs a typed error from a response body, or returns `null` when the
 * body is not an actor error envelope. Never throws on malformed input.
 */
export const parseActorErrorPayload = (body: string): ActorError | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as {
    code?: unknown;
    message?: unknown;
    reason?: unknown;
  };
  if (!isActorErrorCode(candidate.code)) return null;
  return actorErrorForCode(
    candidate.code,
    typeof candidate.message === "string" ? candidate.message : candidate.code,
    // An unknown `reason` is dropped rather than carried through: a client that
    // switches on it must never be handed a value outside the union, and the
    // `code` is still exactly as informative as it was before `reason` existed.
    isActorErrorReason(candidate.reason) ? candidate.reason : undefined,
  );
};
