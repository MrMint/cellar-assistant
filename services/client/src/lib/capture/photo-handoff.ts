/**
 * A photo carried from one capture surface to another without taking it
 * again (X06).
 *
 * Three hand-offs need it:
 *
 * - **Photo search's fallback** (`/search`): a photo the catalogue does not
 *   recognise — or a deployment that cannot search by photo at all — is read
 *   as a label instead, in Add, with the same bytes.
 * - **A label read that says "menu"** (`surfaceKind`, X05): the draft offers
 *   Menu mode with the same photo rather than a new one.
 * - The per-cellar add pages, which have no mode row, hand the same photo to
 *   `/add?mode=menu`.
 *
 * The bytes are a camera capture (a JPEG data URL, a megabyte or more), so
 * they stay in memory, never in a URL or `sessionStorage` (whose quota a
 * couple of photos would spend). The URL carries only a token —
 * `?photo=<token>` — and a full reload simply loses the photo: the surface
 * then opens on the live camera, which is what it would have done anyway.
 *
 * A token is taken once. Plain module, no React — `photo-handoff.test.ts`.
 */

/** How long an unclaimed photo is kept. */
export const PHOTO_HANDOFF_TTL_MS = 10 * 60 * 1000;

/** At most this many photos wait at once; the oldest goes first. */
export const PHOTO_HANDOFF_LIMIT = 4;

const TOKEN = /^[0-9a-z-]{8,64}$/i;

/** `?photo=` as a token this store could have minted, or `undefined`. */
export const photoTokenFrom = (
  value: string | string[] | null | undefined,
): string | undefined => {
  const one = Array.isArray(value) ? value[0] : value;
  return one !== null && one !== undefined && TOKEN.test(one)
    ? one.toLowerCase()
    : undefined;
};

export type PhotoHandoff = {
  /**
   * Keep `photo` until it is taken. `token` defaults to a fresh one; a
   * caller may name it (photo search keys it by the search file's id).
   */
  put(photo: string, token?: string): string;
  /** Whether a photo waits under `token`, without taking it. */
  has(token: string): boolean;
  /** The photo under `token`, once; `undefined` when it is gone. */
  take(token: string): string | undefined;
};

export const createPhotoHandoff = (
  now: () => number = Date.now,
  mint: () => string = () => crypto.randomUUID(),
): PhotoHandoff => {
  const photos = new Map<string, { photo: string; at: number }>();

  const prune = () => {
    const cutoff = now() - PHOTO_HANDOFF_TTL_MS;
    for (const [token, entry] of Array.from(photos)) {
      if (entry.at < cutoff) photos.delete(token);
    }
  };

  return {
    put(photo, token = mint()) {
      prune();
      const key = token.toLowerCase();
      photos.delete(key);
      photos.set(key, { photo, at: now() });
      while (photos.size > PHOTO_HANDOFF_LIMIT) {
        const oldest = photos.keys().next().value;
        if (oldest === undefined) break;
        photos.delete(oldest);
      }
      return key;
    },
    has(token) {
      prune();
      return photos.has(token.toLowerCase());
    },
    take(token) {
      prune();
      const key = token.toLowerCase();
      const entry = photos.get(key);
      photos.delete(key);
      return entry?.photo;
    },
  };
};

/** The app's one hand-off: module scope, so it outlives a navigation. */
export const photoHandoff = createPhotoHandoff();

/** Where a carried photo is read: the capture surface in `mode`. */
export const captureHrefWithPhoto = (
  mode: "bottle" | "menu" | "recipe",
  token: string,
): string => `/add?${new URLSearchParams({ mode, photo: token }).toString()}`;
