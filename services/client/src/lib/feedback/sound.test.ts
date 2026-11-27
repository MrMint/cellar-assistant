/**
 * UI sound (DECISIONS 42, L16): the `button-sounds` sprite read with Web
 * Audio. A fake `AudioContext` records what would play: which window of the
 * file (down at 1000 + 1000·i ms for 190 ms, up 200 ms later for 790 ms), at
 * what gain (0.3 × the cue's factor) and rate (1 ± 0.05). Sounds off is
 * silent; no audio, a failed fetch or a refused decode is silent and never
 * throws; iOS gets the ambient session before the context exists.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register({ url: "http://localhost/" });
}

const sound = await import("./sound");
const { SOUNDS_KEY } = await import("./settings");
const {
  PITCH_VARIATION,
  SOUND_NAMES,
  SOUND_VOLUME,
  SOUNDS,
  playSound,
  preloadSounds,
  resetAudio,
  sampleWindow,
  unlockAudio,
} = sound;

interface Played {
  readonly when: number;
  readonly offset: number;
  readonly duration: number;
  readonly rate: number;
  readonly gain: number;
  readonly buffer: unknown;
}

let played: Played[];
let fetched: string[];
let contexts: FakeContext[];
let sessionTypeAtCreate: string[];
const session = { type: "auto" };

class FakeContext {
  state: "suspended" | "running" = "suspended";
  currentTime = 10;
  destination = {};
  resumed = 0;
  constructor() {
    contexts.push(this);
    sessionTypeAtCreate.push(session.type);
  }
  resume(): Promise<void> {
    this.resumed += 1;
    this.state = "running";
    return Promise.resolve();
  }
  decodeAudioData(buf: ArrayBuffer): Promise<{ bytes: number }> {
    return Promise.resolve({ bytes: buf.byteLength });
  }
  createGain() {
    return { gain: { value: 1 }, connect: () => undefined };
  }
  createBufferSource() {
    const src = {
      buffer: null as unknown,
      playbackRate: { value: 1 },
      gainNode: null as { gain: { value: number } } | null,
      connect: (g: { gain: { value: number } }) => {
        src.gainNode = g;
      },
      start: (when: number, offset: number, duration: number) => {
        played.push({
          when,
          offset,
          duration,
          rate: src.playbackRate.value,
          gain: src.gainNode?.gain.value ?? Number.NaN,
          buffer: src.buffer,
        });
      },
    };
    return src;
  }
}

const realFetch = globalThis.fetch;
type W = { AudioContext?: unknown; webkitAudioContext?: unknown };

function okFetch(): void {
  globalThis.fetch = ((url: string) => {
    fetched.push(String(url));
    return Promise.resolve(new Response(new Uint8Array(16)));
  }) as typeof fetch;
}

/** Let the fetch → decode chain settle. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  resetAudio();
  played = [];
  fetched = [];
  contexts = [];
  sessionTypeAtCreate = [];
  session.type = "auto";
  Object.defineProperty(navigator, "audioSession", {
    value: session,
    configurable: true,
  });
  (window as unknown as W).AudioContext = FakeContext;
  window.localStorage.removeItem(SOUNDS_KEY);
  okFetch();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  Reflect.deleteProperty(window, "AudioContext");
  Reflect.deleteProperty(window, "webkitAudioContext");
  Reflect.deleteProperty(navigator, "audioSession");
});

async function ready(): Promise<void> {
  preloadSounds();
  unlockAudio();
  await settle();
  await settle();
}

describe("the files", () => {
  test("are the three Asus-KBD sprites, self-hosted, with their pair counts", () => {
    assert.deepEqual(SOUNDS, {
      "asus-kbd-soft": 8,
      "asus-kbd-medium": 6,
      "asus-kbd-space": 6,
    });
    preloadSounds();
    assert.deepEqual(fetched.sort(), [
      "/sounds/asus-kbd-medium.mp3",
      "/sounds/asus-kbd-soft.mp3",
      "/sounds/asus-kbd-space.mp3",
    ]);
  });

  test("preload fetches each file once and creates no context (no autoplay warning)", () => {
    preloadSounds();
    preloadSounds();
    assert.equal(fetched.length, SOUND_NAMES.length);
    assert.equal(contexts.length, 0);
  });

  test("reads the sprite layout: down at 1000 + 1000·i for 190 ms, up 200 ms later for 790 ms", () => {
    assert.deepEqual(sampleWindow("down", 0), { startS: 1, lengthS: 0.19 });
    assert.deepEqual(sampleWindow("up", 0), { startS: 1.2, lengthS: 0.79 });
    assert.deepEqual(sampleWindow("down", 7), { startS: 8, lengthS: 0.19 });
    assert.deepEqual(sampleWindow("up", 5), { startS: 6.2, lengthS: 0.79 });
  });
});

describe("playing", () => {
  test("sets the ambient audio session before the context exists", async () => {
    await ready();
    assert.deepEqual(sessionTypeAtCreate, ["ambient"]);
    assert.equal(contexts[0]?.resumed, 1);
  });

  test("plays the down window on press and the matching up on release", async () => {
    await ready();
    const at = (n: number) => () => n;
    assert.equal(playSound("asus-kbd-soft", "down", { random: at(0.4) }), true);
    assert.equal(playSound("asus-kbd-soft", "up", { random: at(0.9) }), true);
    /* 0.4 × 8 pairs → pair 3: down at 4.0 s, its up at 4.2 s. */
    assert.equal(played[0]?.offset, 4);
    assert.equal(played[0]?.duration, 0.19);
    assert.equal(played[1]?.offset, 4.2);
    assert.equal(played[1]?.duration, 0.79);
  });

  test("never repeats the sample it played last", async () => {
    await ready();
    const same = () => 0.5;
    playSound("asus-kbd-medium", "down", { random: same });
    playSound("asus-kbd-medium", "down", { random: same });
    assert.notEqual(played[0]?.offset, played[1]?.offset);
  });

  test("plays at volume 0.3 times the cue's factor, pitch within ±0.05", async () => {
    await ready();
    playSound("asus-kbd-soft", "down", { random: () => 0 });
    playSound("asus-kbd-soft", "down", { random: () => 0.999999 });
    playSound("asus-kbd-soft", "down", { volume: 0.6, random: () => 0.5 });
    assert.equal(SOUND_VOLUME, 0.3);
    assert.equal(PITCH_VARIATION, 0.05);
    assert.equal(played[0]?.gain, 0.3);
    assert.ok(Math.abs((played[2]?.gain ?? 0) - 0.18) < 1e-9);
    assert.ok(Math.abs((played[0]?.rate ?? 0) - 0.95) < 1e-9);
    assert.ok(Math.abs((played[1]?.rate ?? 0) - 1.05) < 1e-5);
    for (let i = 0; i < 200; i++) playSound("asus-kbd-soft", "down");
    for (const p of played) {
      assert.ok(p.rate >= 0.95 - 1e-9 && p.rate <= 1.05 + 1e-9, String(p.rate));
      assert.ok(p.offset >= 1 && p.offset < 1 + SOUNDS["asus-kbd-soft"]);
    }
  });

  test("schedules a delayed sample on the audio clock", async () => {
    await ready();
    playSound("asus-kbd-space", "up", { delayS: 0.06 });
    assert.ok(Math.abs((played[0]?.when ?? 0) - 10.06) < 1e-9);
  });

  test("is silent with Sounds off", async () => {
    await ready();
    window.localStorage.setItem(SOUNDS_KEY, "off");
    assert.equal(playSound("asus-kbd-soft", "down"), false);
    assert.equal(played.length, 0);
  });

  test("is silent, and decodes, when a file has not loaded yet", async () => {
    assert.equal(playSound("asus-kbd-soft", "down"), false);
    await settle();
    await settle();
    assert.equal(playSound("asus-kbd-soft", "down"), true);
  });
});

describe("never throws when audio is unavailable", () => {
  test("no AudioContext at all", () => {
    Reflect.deleteProperty(window, "AudioContext");
    preloadSounds();
    unlockAudio();
    assert.equal(playSound("asus-kbd-soft", "down"), false);
  });

  test("a context that cannot be created", () => {
    (window as unknown as W).AudioContext = class {
      constructor() {
        throw new Error("NotAllowedError");
      }
    };
    unlockAudio();
    assert.equal(playSound("asus-kbd-soft", "down"), false);
  });

  test("a failed fetch, offline, is silent and retried on a later tap", async () => {
    globalThis.fetch = (() =>
      Promise.reject(new TypeError("offline"))) as unknown as typeof fetch;
    await ready();
    assert.equal(playSound("asus-kbd-soft", "down"), false);
    await settle();
    okFetch();
    unlockAudio();
    await settle();
    await settle();
    assert.equal(playSound("asus-kbd-soft", "down"), true);
  });

  test("a 404 and a refused decode", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response("", { status: 404 }),
      )) as unknown as typeof fetch;
    await ready();
    assert.equal(playSound("asus-kbd-soft", "down"), false);
    resetAudio();
    okFetch();
    (window as unknown as W).AudioContext = class extends FakeContext {
      override decodeAudioData(): Promise<{ bytes: number }> {
        return Promise.reject(new Error("EncodingError"));
      }
    };
    await ready();
    assert.equal(playSound("asus-kbd-soft", "down"), false);
  });

  test("a source that throws on start", async () => {
    (window as unknown as W).AudioContext = class extends FakeContext {
      override createBufferSource() {
        const src = super.createBufferSource();
        src.start = () => {
          throw new Error("InvalidStateError");
        };
        return src;
      }
    };
    await ready();
    assert.equal(playSound("asus-kbd-soft", "down"), false);
  });

  test("an audio session that refuses its type", async () => {
    Object.defineProperty(navigator, "audioSession", {
      get: () => {
        throw new Error("nope");
      },
      configurable: true,
    });
    await ready();
    assert.equal(playSound("asus-kbd-soft", "down"), true);
  });
});
