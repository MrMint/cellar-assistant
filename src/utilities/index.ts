import type { ItemTypeValue } from "@cellar-assistant/shared";
import { format as dateFnsFormat, format, parseISO } from "date-fns";

import { always, cond, equals, isEmpty, isNil } from "ramda";

// https://stackoverflow.com/a/76775845
export function getEnums<T extends { [key: string]: number | string }>(
  enumType: T,
): Array<[key: keyof T, value: T[keyof T]]> {
  const keys = Object.keys(enumType).filter((key) => Number.isNaN(Number(key)));
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

export function formatAsPercentage(input: number | null | undefined) {
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
    return undefined as RecursivelyReplaceNullWithUndefined<T>;
  }

  if (
    typeof obj === "object" &&
    obj !== null &&
    (obj.constructor === Object || Array.isArray(obj))
  ) {
    for (const key in obj) {
      (obj as Record<string, unknown>)[key] = nullsToUndefined(
        (obj as Record<string, unknown>)[key],
      );
    }
  }
  return obj as RecursivelyReplaceNullWithUndefined<T>;
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

export function formatVintage(vintage: string | number | null | undefined) {
  if (typeof vintage === "number") {
    return vintage.toString();
  }
  return formatIsoDateString(vintage, "yyyy");
}

export const getNhostStorageUrl = (fileId: string) => {
  if (isNil(process.env.NEXT_PUBLIC_NHOST_REGION)) {
    return `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.storage.nhost.run/v1/files/${fileId}`;
  }
  return `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.storage.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1/files/${fileId}`;
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

export const formatItemType = (type: ItemTypeValue) => {
  switch (type) {
    case "BEER":
      return "Beer";
    case "WINE":
      return "Wine";
    case "SPIRIT":
      return "Spirit";
    case "COFFEE":
      return "Coffee";
    case "SAKE":
      return "Sake";
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

export const typeToIdKey = (type: ItemTypeValue) =>
  cond([
    [equals("BEER"), always("beer_id")],
    [equals("WINE"), always("wine_id")],
    [equals("SPIRIT"), always("spirit_id")],
    [equals("COFFEE"), always("coffee_id")],
    [equals("SAKE"), always("sake_id")],
  ])(type);

export const getItemType = (
  typename: "beers" | "wines" | "spirits" | "coffees" | "sakes",
): ItemTypeValue =>
  cond([
    [equals("beers"), always("BEER" as const)],
    [equals("spirits"), always("SPIRIT" as const)],
    [equals("wines"), always("WINE" as const)],
    [equals("coffees"), always("COFFEE" as const)],
    [equals("sakes"), always("SAKE" as const)],
  ])(typename) as ItemTypeValue;

/**
 * Compress and resize an image data URL to reduce file size.
 * This helps avoid Vercel's serverless function payload limits (~4.5MB).
 *
 * @param dataUrl - The original image as a data URL
 * @param maxDimension - Maximum width/height (default 1400px - preserves fine text)
 * @param quality - JPEG quality 0-1 (default 0.92 - high quality for text recognition)
 * @returns Promise resolving to compressed image data URL
 */
export async function compressImage(
  dataUrl: string,
  maxDimension = 1400,
  quality = 0.92,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Calculate new dimensions maintaining aspect ratio
      let { width, height } = img;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      // Create canvas and draw resized image
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      // Use better quality interpolation
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to compressed JPEG
      const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve(compressedDataUrl);
    };

    img.onerror = () => {
      reject(new Error("Failed to load image for compression"));
    };

    img.src = dataUrl;
  });
}
