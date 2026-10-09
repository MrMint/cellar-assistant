/**
 * What the capture surface remembers between visits — X05 ("mode defaults to
 * the last used"), and the remembered cellar N21's Add to Cellar sheet opens
 * on.
 *
 * Per-viewer conveniences only, so `localStorage` and nothing stronger: a
 * private window, cleared site data or a storage that throws simply means the
 * defaults below — never a broken page (every read and write is guarded). The
 * rules for choosing a default are plain functions so they are tested as data
 * (`capture-prefs.test.ts`); nothing here asks a model anything (D25: no
 * classifier call).
 */
import {
  type ApiItemType,
  ITEM_TYPES,
} from "@/components/cellar-api/itemTypes";

/** What the shutter is for. Bottle is read here; the others lead elsewhere. */
export const CAPTURE_MODES = ["bottle", "menu", "recipe"] as const;
export type CaptureMode = (typeof CAPTURE_MODES)[number];

export type CapturePrefs = {
  readonly mode?: CaptureMode;
  readonly itemType?: ApiItemType;
  /** The last cellar a bottle was filed into, from any add path. */
  readonly cellarId?: string;
};

/** The two calls of `Storage` this needs — a fake in tests. */
export type PrefsStorage = Pick<Storage, "getItem" | "setItem">;

export const CAPTURE_PREFS_KEY = "ca.capture.v1";

const isMode = (value: unknown): value is CaptureMode =>
  typeof value === "string" &&
  (CAPTURE_MODES as readonly string[]).includes(value);

const isItemType = (value: unknown): value is ApiItemType =>
  typeof value === "string" &&
  (ITEM_TYPES as readonly string[]).includes(value);

const browserStorage = (): PrefsStorage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

/** The stored prefs, each kept only if it is still a value this build knows. */
export const readCapturePrefs = (
  storage: PrefsStorage | null = browserStorage(),
): CapturePrefs => {
  if (storage === null) return {};
  try {
    const parsed: unknown = JSON.parse(
      storage.getItem(CAPTURE_PREFS_KEY) ?? "{}",
    );
    if (typeof parsed !== "object" || parsed === null) return {};
    const raw = parsed as Record<string, unknown>;
    return {
      ...(isMode(raw.mode) ? { mode: raw.mode } : {}),
      ...(isItemType(raw.itemType) ? { itemType: raw.itemType } : {}),
      ...(typeof raw.cellarId === "string" && raw.cellarId !== ""
        ? { cellarId: raw.cellarId }
        : {}),
    };
  } catch {
    return {};
  }
};

/** Merge `next` into what is stored. A storage that throws is ignored. */
export const rememberCapturePrefs = (
  next: CapturePrefs,
  storage: PrefsStorage | null = browserStorage(),
): void => {
  if (storage === null) return;
  try {
    storage.setItem(
      CAPTURE_PREFS_KEY,
      JSON.stringify({ ...readCapturePrefs(storage), ...next }),
    );
  } catch {
    // Private mode, a full quota: the default is the fallback, by design.
  }
};

/**
 * The mode the surface opens in: one the entry asked for, else the last used,
 * else Bottle. Never inferred from the picture.
 */
export const defaultCaptureMode = (
  explicit: CaptureMode | null | undefined,
  prefs: CapturePrefs,
): CaptureMode => explicit ?? prefs.mode ?? "bottle";

/** The type a bottle is read as: the route's, else the last used, else wine. */
export const defaultItemType = (
  fixed: ApiItemType | null | undefined,
  prefs: CapturePrefs,
): ApiItemType => fixed ?? prefs.itemType ?? "WINE";

/**
 * The cellar a new bottle goes into. A cellar the route pins wins; else the
 * remembered one, if the viewer can still add to it; else the first they can
 * (`myCellars` is ordered by recent activity, D13); else none — the item is
 * catalogued without a bottle.
 */
export const defaultCellarId = (
  pinned: string | null | undefined,
  prefs: CapturePrefs,
  addable: readonly { readonly id: string }[],
): string | null => {
  if (pinned !== null && pinned !== undefined) return pinned;
  if (
    prefs.cellarId !== undefined &&
    addable.some((cellar) => cellar.id === prefs.cellarId)
  ) {
    return prefs.cellarId;
  }
  return addable[0]?.id ?? null;
};
