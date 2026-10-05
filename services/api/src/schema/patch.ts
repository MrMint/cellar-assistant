/**
 * The patch policy every update mutation marshals its input through.
 *
 * Pothos hands an optional input field back as `T | null | undefined`, and the
 * actors distinguish "absent" (leave it) from `null` (clear it) — so each field
 * of an update input needs a decision about what an explicit `null` means:
 *
 *   - `"keep"`      — `null` means the same as absent: the key is omitted. For
 *                     fields the actor cannot clear (a name, a privacy level).
 *   - `"clearable"` — `null` is forwarded as `null`, and the actor clears it.
 *   - `"reject"`    — `null` is a `ValidationError`. For fields where `null`
 *                     would read as "clear" to a caller but the actor has no
 *                     such thing (a NOT NULL column, a list replaced wholesale),
 *                     so neither ignoring it nor forwarding it is honest.
 *
 * Absent is always omitted and a value always sent. A rule may carry a `map`
 * for a value that needs converting on the way through (an `ID` to a string, a
 * JSON value to its text); `map` never sees `null`.
 *
 * A policy is declared `satisfies PatchPolicy<typeof SomeInput.$inferInput>`,
 * which demands exactly one rule per input field: a field added to the GraphQL
 * input without a policy is a type error, as is a rule for a field that is not
 * there. `patch-policy.test.ts` pins the resulting behaviour field by field,
 * and fails for any mutation taking a nullable-field input object that it has
 * neither pinned nor classified as not-a-patch.
 */
import { ValidationError } from "@cellar-assistant/contracts";

/** Neither absent nor `null`. */
export const present = <T>(value: T | null | undefined): value is T =>
  value !== undefined && value !== null;

type Mode = "keep" | "clearable" | "reject";

export type FieldRule<In> =
  | Mode
  | {
      readonly policy: Mode;
      readonly map: (value: NonNullable<In>) => unknown;
    };

/** Exactly one rule for every field of `Input`. */
export type PatchPolicy<Input> = {
  readonly [K in keyof Input]-?: FieldRule<Input[K]>;
};

type Sent<R, V> = R extends { readonly map: (value: never) => infer O }
  ? O
  : NonNullable<V>;
type Cleared<R> = R extends "clearable" | { readonly policy: "clearable" }
  ? null
  : never;

/** What `patch` builds: every key optional, `null` only where clearable. */
export type Patch<Input, P> = {
  -readonly [K in keyof P & keyof Input]?: Sent<P[K], Input[K]> | Cleared<P[K]>;
};

/** Applies `policy` to `input`, field by field. Throws for `null` on a `"reject"` field. */
export const patch = <Input extends object, P extends PatchPolicy<Input>>(
  input: Input,
  policy: P,
): Patch<Input, P> => {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(policy) as (keyof Input & string)[]) {
    const value = input[key];
    if (value === undefined) continue;
    const rule: FieldRule<Input[typeof key]> = policy[key];
    const mode = typeof rule === "string" ? rule : rule.policy;
    if (value === null) {
      if (mode === "reject") {
        throw new ValidationError(
          `${key} cannot be null; omit it to leave it unchanged`,
        );
      }
      if (mode === "clearable") out[key] = null;
      continue;
    }
    out[key] = typeof rule === "string" ? value : rule.map(value);
  }
  return out as Patch<Input, P>;
};
