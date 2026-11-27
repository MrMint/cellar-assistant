/**
 * UI sound (DECISIONS 42, SPEC § Sound, ruling L16): the Asus-KBD recordings
 * from Josh Comeau's MIT `button-sounds`, self-hosted under `public/sounds/`
 * with its licence, played straight from the package's sprite layout with Web
 * Audio. No howler: the sprite is four numbers, and Web Audio is what the
 * iPhone's ambient rule needs.
 *
 * The sprite (each file): 1000 ms of silence, then one pair per second. Pair
 * `i` (from 0) has its down sample at `1000 + 1000·i` ms (190 ms long) and
 * its up sample 200 ms later (790 ms long). A press picks a sample at random,
 * never the one it played last, so repeats never sound identical; a release
 * plays the up of the press it ends.
 *
 * iPhone: `navigator.audioSession.type = "ambient"` (Safari 17+) before the
 * context exists, so sound follows the silent switch and mixes with the
 * person's music rather than stopping it. The context is created and resumed
 * on the first tap (`unlockAudio`), after which sound, unlike iPhone haptics,
 * can play from a timer or a threshold. Android plays at media volume.
 *
 * A failed load, a missing `AudioContext`, a refused decode: all silent,
 * never an error. Nothing here loops.
 */
import { soundsEnabled } from "./settings";

/** The files shipped, and how many down/up pairs each one holds. */
export const SOUNDS = {
  "asus-kbd-soft": 8,
  "asus-kbd-medium": 6,
  "asus-kbd-space": 6,
} as const;

export type SoundName = keyof typeof SOUNDS;
export type SoundPhase = "down" | "up";

export const SOUND_NAMES = Object.keys(SOUNDS) as SoundName[];

/** Every sound plays at this gain (times a cue's own factor). */
export const SOUND_VOLUME = 0.3;
/** Playback rate varies by up to ± this, so a run of presses never drones. */
export const PITCH_VARIATION = 0.05;

/** The sprite layout shared by every `button-sounds` file, in ms. */
export const SPRITE = {
  firstMs: 1000,
  strideMs: 1000,
  down: { offsetMs: 0, lengthMs: 190 },
  up: { offsetMs: 200, lengthMs: 790 },
} as const;

export const soundUrl = (name: SoundName): string => `/sounds/${name}.mp3`;

/** Where sample `index` of `phase` sits in the file, in seconds. */
export function sampleWindow(
  phase: SoundPhase,
  index: number,
): { readonly startS: number; readonly lengthS: number } {
  const part = SPRITE[phase];
  return {
    startS: (SPRITE.firstMs + SPRITE.strideMs * index + part.offsetMs) / 1000,
    lengthS: part.lengthMs / 1000,
  };
}

type AudioContextCtor = new () => AudioContext;

/** `undefined`: not tried yet; `null`: this browser has none. */
let ctx: AudioContext | null | undefined;
const bytes = new Map<SoundName, Promise<ArrayBuffer | null>>();
const decoded = new Map<SoundName, AudioBuffer>();
const decoding = new Set<SoundName>();
const lastIndex = new Map<SoundName, number>();
/** Bumped by `resetAudio`, so a decode still in flight cannot write into a fresh start. */
let generation = 0;

/** Ask iOS to treat this page's audio as ambient. Safari 17+; elsewhere a no-op. */
function setAmbient(): void {
  try {
    const session = (
      navigator as Navigator & { audioSession?: { type: string } }
    ).audioSession;
    if (session !== undefined) session.type = "ambient";
  } catch {
    /* Not settable here: the default session is used. */
  }
}

function context(): AudioContext | null {
  if (ctx !== undefined) return ctx;
  try {
    if (typeof window === "undefined") return null;
    setAmbient();
    const w = window as Window & {
      AudioContext?: AudioContextCtor;
      webkitAudioContext?: AudioContextCtor;
    };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    ctx = Ctor === undefined ? null : new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

function fetchBytes(name: SoundName): Promise<ArrayBuffer | null> {
  const known = bytes.get(name);
  if (known !== undefined) return known;
  let got: Promise<ArrayBuffer | null>;
  try {
    got = fetch(soundUrl(name))
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .catch(() => null);
  } catch {
    got = Promise.resolve(null);
  }
  bytes.set(name, got);
  return got;
}

/** Decode a sound once there is a context; a failure is forgotten so a later tap retries. */
function ensureDecoded(name: SoundName): void {
  const c = context();
  if (c === null || decoded.has(name) || decoding.has(name)) return;
  decoding.add(name);
  const gen = generation;
  const fail = (): void => {
    if (gen !== generation) return;
    decoding.delete(name);
    bytes.delete(name);
  };
  void fetchBytes(name)
    .then((buf) => {
      if (buf === null) return fail();
      return Promise.resolve(c.decodeAudioData(buf.slice(0))).then((audio) => {
        if (gen !== generation) return;
        decoded.set(name, audio);
        decoding.delete(name);
      });
    })
    .catch(fail);
}

/** Fetch every file (no context yet, so no autoplay warning). Call after first paint. */
export function preloadSounds(): void {
  try {
    for (const name of SOUND_NAMES) void fetchBytes(name);
  } catch {
    /* Silent by rule. */
  }
}

/** Create and resume the context, inside the first tap; decode what was fetched. */
export function unlockAudio(): void {
  try {
    const c = context();
    if (c === null) return;
    if (c.state === "suspended") void c.resume().catch(() => undefined);
    for (const name of SOUND_NAMES) ensureDecoded(name);
  } catch {
    /* Silent by rule. */
  }
}

function pickIndex(
  name: SoundName,
  phase: SoundPhase,
  random: () => number,
): number {
  const count = SOUNDS[name];
  const last = lastIndex.get(name);
  if (phase === "up" && last !== undefined) return last;
  let index = Math.min(count - 1, Math.floor(random() * count));
  if (count > 1 && index === last) index = (index + 1) % count;
  lastIndex.set(name, index);
  return index;
}

export interface PlayOptions {
  /** A cue's own factor on `SOUND_VOLUME` (detent plays at 0.6). */
  readonly volume?: number;
  /** Start this many seconds from now, on the audio clock. */
  readonly delayS?: number;
  /** For tests: the source of randomness. */
  readonly random?: () => number;
}

/**
 * Play one sample. Returns whether it was scheduled: false with Sounds off,
 * with no audio, or while the file is still loading (the first press after
 * load may be silent). Never throws.
 */
export function playSound(
  name: SoundName,
  phase: SoundPhase,
  { volume = 1, delayS = 0, random = Math.random }: PlayOptions = {},
): boolean {
  try {
    if (!soundsEnabled()) return false;
    const c = context();
    if (c === null) return false;
    if (c.state === "suspended") void c.resume().catch(() => undefined);
    const buffer = decoded.get(name);
    if (buffer === undefined) {
      ensureDecoded(name);
      return false;
    }
    const { startS, lengthS } = sampleWindow(
      phase,
      pickIndex(name, phase, random),
    );
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 1 + (random() * 2 - 1) * PITCH_VARIATION;
    const gain = c.createGain();
    gain.gain.value = SOUND_VOLUME * volume;
    source.connect(gain);
    gain.connect(c.destination);
    source.start(c.currentTime + Math.max(0, delayS), startS, lengthS);
    return true;
  } catch {
    return false;
  }
}

/** Forget the context and every buffer. For tests. */
export function resetAudio(): void {
  generation += 1;
  ctx = undefined;
  bytes.clear();
  decoded.clear();
  decoding.clear();
  lastIndex.clear();
}
