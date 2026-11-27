import { type Companion, parseCompanions } from "./pour-plan";

/**
 * The last "who with" poured with — a per-viewer convenience, kept in
 * `localStorage` **per account** (F-57, FR-9).
 *
 * It used to be one key per device, so on a shared phone the next account
 * was offered the last one's friend by name. Now each account has its own
 * key, nothing is read until the session says whose it is, and sign-out
 * (`purgeUserCaches`, which also runs when `/sign-in` mounts) forgets every
 * account's memory.
 */
const PREFIX = "ca.pour.lastCompanions";

/** The key one account's memory lives under. */
export const companionsKey = (userId: string): string => `${PREFIX}:${userId}`;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key"> & {
  readonly length: number;
};

const local = (): Store | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** This account's remembered companions; none when nobody is signed in. */
export const readRememberedCompanions = (
  userId: string | null,
  store: Store | null = local(),
): Companion[] => {
  if (userId === null || store === null) return [];
  try {
    return parseCompanions(store.getItem(companionsKey(userId)));
  } catch {
    return [];
  }
};

/** Remember who this account last poured with. Never throws. */
export const rememberCompanions = (
  userId: string | null,
  companions: readonly Companion[],
  store: Store | null = local(),
): void => {
  if (userId === null || store === null) return;
  try {
    store.setItem(companionsKey(userId), JSON.stringify(companions));
  } catch {
    // Private mode or blocked storage: the chip just isn't offered next time.
  }
};

/**
 * Forget every account's remembered companions, and the old per-device key.
 * Runs on sign-out. Never throws: a sign-out must not fail on storage.
 */
export const forgetRememberedCompanions = (
  store: Store | null = local(),
): void => {
  if (store === null) return;
  try {
    const doomed: string[] = [];
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (key === PREFIX || key?.startsWith(`${PREFIX}:`)) doomed.push(key);
    }
    for (const key of doomed) store.removeItem(key);
  } catch {
    // Blocked storage holds nothing to forget.
  }
};
