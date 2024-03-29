import { ItemType } from "@shared/gql/graphql";
import { format as dateFnsFormat, format, parseISO } from "date-fns";
import { ImageLoaderProps } from "next/image";
import { always, cond, equals, isEmpty, isNil } from "ramda";

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
  if (isNil(input) || isEmpty(input)) return undefined;
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

/***
 * Converts a dataUrl base64 image string into a File byte array
 * dataUrl example:
 * data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIsAAACLCAYAAABRGWr/AAAAAXNSR0IA...etc
 */
export function dataUrlToFile(
  dataUrl: string,
  filename: string,
): File | undefined {
  const arr = dataUrl.split(",");
  if (arr.length < 2) {
    return undefined;
  }
  const mimeArr = arr[0].match(/:(.*?);/);
  if (!mimeArr || mimeArr.length < 2) {
    return undefined;
  }
  const mime = mimeArr[1];
  const buff = Buffer.from(arr[1], "base64");
  return new File([buff], filename, { type: mime });
}

export function formatVintage(vintage: string | null | undefined) {
  return formatIsoDateString(vintage, "yyyy");
}

export const nhostImageLoader = ({ width, src, quality }: ImageLoaderProps) => {
  if (isNil(process.env.NEXT_PUBLIC_NHOST_REGION)) {
    return `https://${
      process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN
    }.storage.nhost.run/v1/files/${src}?w=${width}&q=${quality || 75}`;
  }
  return `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.storage.${
    process.env.NEXT_PUBLIC_NHOST_REGION
  }.nhost.run/v1/files/${src}?w=${width}&q=${quality || 75}`;
};

export function getRandomInt(max: number) {
  return Math.floor(Math.random() * max);
}

export const getNextPlaceholder = (
  placeholderDataUrl: string | undefined | null,
): `data:image/${string}` | undefined => {
  if (isNil(placeholderDataUrl)) return undefined;
  return `data:image/${placeholderDataUrl}`;
};

export const formatItemType = (type: ItemType) => {
  switch (type) {
    case ItemType.Beer:
      return "Beer";
    case ItemType.Wine:
      return "Wine";
    case ItemType.Spirit:
      return "Spirit";
    case ItemType.Coffee:
      return "Coffee";
    default:
      throw new Error("Unsupported item type");
  }
};

export const parseDate = (
  value: string | null | undefined,
): Date | undefined => {
  if (isNil(value) || isEmpty(value)) return undefined;
  return new Date(value);
};

export const parseNumber = (value: string | null | undefined) => {
  if (isNil(value) || isEmpty(value)) return undefined;
  const result = Number.parseFloat(value);
  if (Number.isNaN(result)) return undefined;
  return result;
};

export const convertYearToDate = (year: number | null | undefined) => {
  if (isNil(year) || isEmpty(year)) return undefined;

  return format(new Date(year, 0, 1), "yyyy-MM-dd");
};

export const typeToIdKey = (type: ItemType) =>
  cond([
    [equals(ItemType.Beer), always("beer_id")],
    [equals(ItemType.Wine), always("wine_id")],
    [equals(ItemType.Spirit), always("spirit_id")],
    [equals(ItemType.Coffee), always("coffee_id")],
  ])(type);

export const getItemType = (
  typename: "beers" | "wines" | "spirits" | "coffees",
): ItemType =>
  cond([
    [equals("beers"), always(ItemType.Beer)],
    [equals("spirits"), always(ItemType.Spirit)],
    [equals("wines"), always(ItemType.Wine)],
    [equals("coffees"), always(ItemType.Coffee)],
  ])(typename);
