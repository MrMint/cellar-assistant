// https://stackoverflow.com/a/76775845
export function getEnums<T extends { [key: string]: number | string }>(
  enumType: T,
): Array<[key: keyof T, value: T[keyof T]]> {
  const keys = Object.keys(enumType).filter((key) => isNaN(Number(key)));
  return keys.map((key) => [key, enumType[key] as T[keyof T]]);
}
