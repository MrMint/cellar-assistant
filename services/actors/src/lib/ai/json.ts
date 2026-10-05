/**
 * Turning a completion into a value — the one place a model's answer is parsed.
 *
 * Every failure here throws. There is no "if it does not parse, use an empty
 * object" branch anywhere, because that is the shape the whole of X1 is written
 * against: a menu scan that completes with zero lines, or an onboarding that
 * completes with `{}` for its defaults, is worse than one that fails, since
 * nothing downstream can tell it from a real answer.
 */
import { ConflictError } from "@cellar-assistant/contracts";

/** Models fence JSON in ```json blocks even when asked not to. */
const unfence = (text: string): string => {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
};

export const parseModelJson = (
  content: string,
  what: string,
): Record<string, unknown> => {
  const body = unfence(content);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new ConflictError(
      `the model's ${what} answer is not JSON ` +
        `(${error instanceof Error ? error.message : String(error)}): ` +
        `${body.slice(0, 300)}`,
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ConflictError(
      `the model's ${what} answer is not a JSON object: ${body.slice(0, 300)}`,
    );
  }
  return parsed as Record<string, unknown>;
};

export const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

export const requireStr = (
  value: unknown,
  field: string,
  what: string,
): string => {
  const text = str(value);
  if (text === null) {
    throw new ConflictError(
      `the model's ${what} answer has no \`${field}\`, which this pipeline ` +
        "cannot proceed without",
    );
  }
  return text;
};

export const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** 0–1, clamped. `menu_scans.confidence_score` is `numeric(3,2)`. */
export const confidence = (value: unknown, fallback: number): number => {
  const parsed = num(value);
  if (parsed === null) return fallback;
  return Math.min(1, Math.max(0, parsed));
};

export const bool = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

export const arr = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

export const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
