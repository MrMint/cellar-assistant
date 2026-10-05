/**
 * The one selection every result union's error branch uses.
 *
 * Every query and mutation on `services/api` answers with a union of a success
 * type and the five typed errors, all of which implement `ActorError` (plan
 * §8.3). Before this fragment existed each of ~120 documents spelled the error
 * branch out inline — `... on ActorError { code message }` — and so none of
 * them selected `reason`, the discriminator B4b built end to end precisely so
 * that a client would stop parsing English. `FriendsClient` was still
 * substring-matching the actor's prose to tell "already friends" from "they
 * already asked you" after `reason` had shipped, because the selection that
 * would have carried it was copied from a document written before it existed.
 *
 * So the branch is one fragment, spread as `...ActorErrorFields` directly into
 * the union (a fragment on an interface spreads into any union whose members
 * implement it), and `dev-checks/actor-error-selections.test.ts` fails on an
 * inline `... on ActorError {` or `... on Error {` selection in client source.
 * Adding a field here reaches every document at once, which is the point.
 *
 * `@_unmask` is gql.tada's own directive, stripped from the definition before
 * the document is built: it turns off fragment masking, so `unwrapResult` and
 * every caller read `code`, `reason` and `message` straight off the union
 * member instead of threading them through `readFragment`. `__typename` is
 * selected inside the fragment too — without it a fragment spread into a union
 * branch types as `never` (D2 lost a debugging round to this).
 */
import { graphql, type ResultOf } from "./graphql.ts";

export const ActorErrorFieldsFragment = graphql(`
  fragment ActorErrorFields on ActorError @_unmask {
    __typename
    code
    reason
    message
  }
`);

/** Any typed error the API can answer with, exactly as selected. */
export type ActorErrorFields = ResultOf<typeof ActorErrorFieldsFragment>;

/**
 * `NOT_FOUND | FORBIDDEN | CONFLICT | VALIDATION | BUDGET_EXCEEDED` — the
 * `ActorErrorCode` enum, derived from the schema rather than restated, so a
 * comparison against a code the API does not have is a compile error.
 */
export type ActorErrorCode = ActorErrorFields["code"];

/**
 * The `ActorErrorReason` enum, likewise derived. `null` is excluded here and
 * kept on the field: most errors carry no reason.
 *
 * The enum is documented as **additive** — a newer API may send a value this
 * build was not compiled against. gql.tada types the field as the union it
 * knows, so treat anything unrecognised exactly as `null` and fall back to
 * `code`; never let a `switch` over this assume it is exhaustive at runtime.
 */
export type ActorErrorReason = NonNullable<ActorErrorFields["reason"]>;
