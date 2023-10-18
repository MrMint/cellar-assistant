import { format as dateFnsFormat, parseISO } from "date-fns";
import { isNil, isNotNil } from "ramda";

// https://stackoverflow.com/a/76775845
export function getEnums<T extends { [key: string]: number | string }>(
  enumType: T,
): Array<[key: keyof T, value: T[keyof T]]> {
  const keys = Object.keys(enumType).filter((key) => isNaN(Number(key)));
  return keys.map((key) => [key, enumType[key] as T[keyof T]]);
}

// Inspired from https://github.com/microsoft/TypeScript/issues/30611#issuecomment-570773496
export function getEnumKeys<
  T extends string,
  TEnumValue extends string | number,
>(enumVariable: { [key in T]: TEnumValue }) {
  return Object.keys(enumVariable) as Array<T>;
}

export function formatIsoDateString(
  input: string | null | undefined,
  format: string,
) {
  if (isNil(input)) return undefined;
  return dateFnsFormat(parseISO(input), format);
}

export function formatAsPercentage(input: string | null | undefined) {
  if (isNil(input)) return undefined;
  return `${input}%`;
}

// https://stackoverflow.com/a/72549576
type RecursivelyReplaceNullWithUndefined<T> = T extends null
  ? undefined
  : T extends (infer U)[]
  ? RecursivelyReplaceNullWithUndefined<U>[]
  : T extends Record<string, unknown>
  ? { [K in keyof T]: RecursivelyReplaceNullWithUndefined<T[K]> }
  : T;

export function nullsToUndefined<T>(
  obj: T,
): RecursivelyReplaceNullWithUndefined<T> {
  if (obj === null || obj === undefined) {
    return undefined as any;
  }

  if ((obj as any).constructor.name === "Object" || Array.isArray(obj)) {
    for (const key in obj) {
      obj[key] = nullsToUndefined(obj[key]) as any;
    }
  }
  return obj as any;
}
