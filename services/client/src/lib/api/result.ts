/**
 * Unwrapping the `<Command>Result` unions (plan §8.3).
 *
 * Every query and mutation on `services/api` answers with a union of one success
 * type and the five typed errors, all of which implement `ActorError`. Selecting
 * `__typename` on the success branch and spreading `...ActorErrorFields`
 * (`errors.ts`) on the rest makes that union a discriminated union in
 * TypeScript, which is what these helpers narrow.
 *
 * There is deliberately no `throw` here. A `NotFoundError` from `cellar(id:)`
 * is an ordinary outcome — §1.6 makes it cover both "no such cellar" and "not
 * yours to see" — and a page that renders "not found" is the correct response
 * to it, not an error boundary.
 */
import type {
  ActorErrorCode,
  ActorErrorFields,
  ActorErrorReason,
} from "./errors.ts";

/**
 * The shape every branch of a result union that is not the success carries,
 * plus the two failures that never reached a resolver.
 *
 * **Branch on `reason`, then `code`; never on `message`.** `message` is the
 * actor's English, written for a person, and it changes without notice.
 * `reason` is the stable discriminator for the cases where one `code` covers
 * several outcomes — `sendFriendRequest` has three distinct `CONFLICT`s — and
 * `null` on most errors. It is additive: a newer API may send a value this
 * build does not know, which compares unequal to every literal here and so
 * falls through to the `code` branch, as the schema says it should.
 */
export type ApiFailure = {
  __typename: string;
  /**
   * One of the five `ActorErrorCode`s, or one of this module's own two:
   * `TRANSPORT` (no answer, or a resolver that threw instead of answering with
   * a typed error) and `UNKNOWN` (a union member that selected no code, which
   * `dev-checks/actor-error-selections.test.ts` exists to make impossible).
   */
  code: ActorErrorCode | "TRANSPORT" | "UNKNOWN";
  reason: ActorErrorReason | null;
  message: string;
};

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiFailure };

const UNREACHABLE: ApiFailure = {
  __typename: "TransportError",
  code: "TRANSPORT",
  reason: null,
  message: "The server did not answer. Check your connection and try again.",
};

/**
 * Narrow a result union to its success branch.
 *
 * `success` is the success type's name — `"Cellar"`, `"CellarConnection"`,
 * `"CellarItem"` — and the return type is the matching member of the union, so
 * callers keep every field gql.tada inferred.
 *
 * `null`/`undefined` (a transport failure, or a field URQL never populated)
 * comes back as a failure rather than throwing, so a caller has exactly one
 * shape to branch on.
 */
export const unwrapResult = <
  TUnion extends { __typename: string },
  TName extends TUnion["__typename"],
>(
  value: TUnion | null | undefined,
  success: TName,
): ApiResult<Extract<TUnion, { __typename: TName }>> => {
  if (value === null || value === undefined) {
    return { ok: false, error: UNREACHABLE };
  }
  if (value.__typename === success) {
    return {
      ok: true,
      data: value as Extract<TUnion, { __typename: TName }>,
    };
  }
  const failure = value as Partial<ActorErrorFields>;
  return {
    ok: false,
    error: {
      __typename: value.__typename,
      code: failure.code ?? "UNKNOWN",
      reason: failure.reason ?? null,
      message: failure.message ?? "Something went wrong.",
    },
  };
};

/**
 * A transport- or resolver-level failure, as a failure this UI can render.
 *
 * Not everything arrives as a typed error. A resolver that throws — today, any
 * path through `EmbeddingActor`, which has no embedding provider wired yet —
 * comes back as a GraphQL error with `data: null`, and `unwrapResult` would
 * report it as "the server did not answer", which is both wrong and unhelpful.
 * Prefer this when URQL hands you an `error`.
 */
export const failureFromTransport = (error: {
  message: string;
  graphQLErrors?: readonly { message: string }[];
}): ApiFailure => ({
  __typename: "TransportError",
  code: "TRANSPORT",
  reason: null,
  message: error.graphQLErrors?.[0]?.message ?? error.message,
});

/** True for the one error code a page should render as "not found" (§1.6). */
export const isNotFound = (error: ApiFailure): boolean =>
  error.code === "NOT_FOUND";
