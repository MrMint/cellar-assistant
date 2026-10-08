/**
 * "No model response" (D17), as a fact recorded beside an error.
 *
 * Its own module because both `http.ts` and `image-mime.ts` mark errors with
 * it, and `http.ts` already imports `image-mime.ts`.
 */

/**
 * The errors that prove no model ever answered.
 *
 * D17: "only calls that got a model response count against the allowance".
 * `budget.ts` reserves before every call; when the call then fails it has to
 * know which of two things happened — the provider was never reached (or
 * refused the request outright, before generating anything), so nothing was
 * used and the reservation is given back; or an answer *did* arrive and
 * something went wrong reading it, in which case the call counts.
 *
 * The error's **class** cannot carry that: it is the retry schedule (`http.ts`'s
 * header) and a 5xx and a garbled 200 are both `ConflictError`. So the
 * fact is recorded beside the error instead, at the few places that know it —
 * `postJson`'s transport and HTTP-status branches, the Vertex token
 * exchange, llama-server's marker read, and `requireImageMime`'s refusal —
 * and read back with {@link isNoModelResponse}.
 *
 * A `WeakSet` and not a property: the error objects are the providers' own
 * `ConflictError`s and `ValidationError`s, and an extra enumerable field
 * would ride into every log line and every wire envelope. Membership is
 * in-process only, which is all it needs to be — the metering wrapper calls
 * the provider in the same turn.
 *
 * **Unmarked means "counts".** Anything this set does not name — including a
 * failure nobody thought to mark — is treated as a call that may have been
 * billed. That is the safe direction for a budget: an over-count costs a
 * user one retry's worth of allowance; an under-count is an invoice nobody
 * capped.
 */
const unanswered = new WeakSet<object>();

/** Record that `error` was raised before any model answered. Returns it. */
export const noModelResponse = <E>(error: E): E => {
  if (typeof error === "object" && error !== null) unanswered.add(error);
  return error;
};

/** Was `error` raised before any model answered? See {@link noModelResponse}. */
export const isNoModelResponse = (error: unknown): boolean =>
  typeof error === "object" && error !== null && unanswered.has(error);

/**
 * Run `call`, marking whatever it throws as {@link noModelResponse}. For a
 * step that always precedes the model call — a token exchange, a capability
 * probe — so every way it can fail is, by construction, before any answer.
 */
export const beforeModelCall = async <T>(
  call: () => Promise<T>,
): Promise<T> => {
  try {
    return await call();
  } catch (error) {
    throw noModelResponse(error);
  }
};
