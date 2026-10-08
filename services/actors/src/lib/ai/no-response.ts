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
 * A `WeakMap` and not a property: the error objects are the providers' own
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
const unanswered = new WeakMap<object, "unbilled" | "maybe-billed">();

/**
 * Record that `error` was raised before any model answered. Returns it.
 *
 * `maybeBilled` is for a request that left this process and then produced no
 * answer — a timeout, a reset connection. No model answered, so per D17 it
 * does not use up anyone's *allowance*; but the provider may still have run
 * it and may still bill it, so its *cost* stays booked (`releaseForModel`'s
 * `keepCost`). An HTTP error status, or a refusal before anything was sent, is
 * neither, and gives back both.
 */
export const noModelResponse = <E>(
  error: E,
  options: { readonly maybeBilled?: boolean } = {},
): E => {
  if (typeof error === "object" && error !== null) {
    unanswered.set(
      error,
      options.maybeBilled === true ? "maybe-billed" : "unbilled",
    );
  }
  return error;
};

/** Was `error` raised before any model answered? See {@link noModelResponse}. */
export const isNoModelResponse = (error: unknown): boolean =>
  typeof error === "object" && error !== null && unanswered.has(error);

/**
 * An unanswered call the provider may nonetheless have run and billed — see
 * {@link noModelResponse}'s `maybeBilled`.
 */
export const mayHaveBeenBilled = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  unanswered.get(error) === "maybe-billed";

/** Carry `from`'s mark (if any) onto `to`, for an error that is rewrapped. */
export const keepNoModelResponse = <E>(from: unknown, to: E): E =>
  isNoModelResponse(from)
    ? noModelResponse(to, { maybeBilled: mayHaveBeenBilled(from) })
    : to;

/**
 * Run `call`, marking whatever it throws as {@link noModelResponse}. For a
 * step that always precedes the model call — a token exchange, a capability
 * probe — so every way it can fail is, by construction, before any answer
 * and before anything was sent to a model.
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
