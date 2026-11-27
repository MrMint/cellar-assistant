/**
 * `feedback(name)` (MC-feedback): one call fires the haptic and the sound
 * that share a name, through the real players, on an Android-shaped device
 * (a `vibrate` stub records patterns; a fake `AudioContext` records which
 * sample of which file starts). Holds the SPEC § Sound table, the down/up
 * phases, the opt-outs, the settings store and its answers, and that nothing
 * throws.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register({ url: "http://localhost/" });
}

const { CUES, COMMIT_UP_DELAY_S, feedback, HAPTICS_KEY, SOUNDS_KEY } =
  await import("./index");
const { feedbackSettings, setFeedbackSettings } = await import("./settings");
const { preloadSounds, resetAudio, unlockAudio } = await import("./sound");
type FeedbackName = import("./index").FeedbackName;

interface Start {
  readonly file: string;
  readonly phase: "down" | "up";
  readonly when: number;
  readonly gain: number;
}

let vibrated: unknown[];
let started: Start[];

class FakeContext {
  state = "running";
  currentTime = 0;
  destination = {};
  resume() {
    return Promise.resolve();
  }
  decodeAudioData(buf: ArrayBuffer) {
    return Promise.resolve({ file: new TextDecoder().decode(buf) });
  }
  createGain() {
    return { gain: { value: 1 }, connect: () => undefined };
  }
  createBufferSource() {
    let gain = { gain: { value: Number.NaN } };
    const src = {
      buffer: null as { file: string } | null,
      playbackRate: { value: 1 },
      connect: (g: typeof gain) => {
        gain = g;
      },
      start: (when: number, offset: number) => {
        /* An up sample starts 200 ms into its pair's second. */
        const phase = Math.round((offset % 1) * 10) === 2 ? "up" : "down";
        started.push({
          file: src.buffer?.file ?? "?",
          phase,
          when,
          gain: gain.gain.value,
        });
      },
    };
    return src;
  }
}

const realFetch = globalThis.fetch;
const proto = Object.getPrototypeOf(navigator) as object;
const vibrate = Object.getOwnPropertyDescriptor(proto, "vibrate");
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  vibrated = [];
  started = [];
  window.localStorage.removeItem(HAPTICS_KEY);
  window.localStorage.removeItem(SOUNDS_KEY);
  Object.defineProperty(proto, "vibrate", {
    value: (p: unknown) => {
      vibrated.push(p);
      return true;
    },
    configurable: true,
  });
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeContext;
  /* Each file's bytes are its own name, so a start says which file played. */
  globalThis.fetch = ((url: string) =>
    Promise.resolve(
      new Response(String(url).replace(/^.*\/|\.mp3$/g, "")),
    )) as typeof fetch;
  resetAudio();
  preloadSounds();
  unlockAudio();
  await settle();
  await settle();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (vibrate) Object.defineProperty(proto, "vibrate", vibrate);
  else Reflect.deleteProperty(proto, "vibrate");
  Reflect.deleteProperty(window, "AudioContext");
});

const s = (file: string, phase: "down" | "up") => ({ file, phase });
const heard = () => started.map(({ file, phase }) => ({ file, phase }));

describe("the table (SPEC § Sound, KIT)", () => {
  const TABLE: Record<
    FeedbackName,
    { haptic: unknown; sound: ReturnType<typeof s>[] }
  > = {
    press: { haptic: null, sound: [s("asus-kbd-soft", "down")] },
    primary: { haptic: null, sound: [s("asus-kbd-medium", "down")] },
    toggle: { haptic: [10], sound: [s("asus-kbd-space", "down")] },
    tick: { haptic: [10], sound: [s("asus-kbd-soft", "down")] },
    detent: { haptic: [8], sound: [s("asus-kbd-soft", "down")] },
    hold: { haptic: [14], sound: [s("asus-kbd-medium", "down")] },
    undo: { haptic: [8, 30, 8], sound: [s("asus-kbd-soft", "up")] },
    success: {
      haptic: [12, 40, 18],
      sound: [s("asus-kbd-space", "down"), s("asus-kbd-space", "up")],
    },
    medium: {
      haptic: [14, 50, 14, 50, 20],
      sound: [s("asus-kbd-space", "down"), s("asus-kbd-space", "up")],
    },
    big: {
      haptic: [18, 60, 18, 60, 30, 90, 40],
      sound: [s("asus-kbd-space", "down"), s("asus-kbd-space", "up")],
    },
    refuse: { haptic: [30, 40, 30], sound: [] },
  };

  for (const name of Object.keys(TABLE) as FeedbackName[]) {
    test(`${name} fires its haptic and its sound`, () => {
      const want = TABLE[name];
      feedback(name);
      assert.deepEqual(vibrated, want.haptic === null ? [] : [want.haptic]);
      assert.deepEqual(heard(), want.sound);
    });
  }

  test("covers every name, and no more", () => {
    assert.deepEqual(Object.keys(CUES).sort(), Object.keys(TABLE).sort());
  });

  test("detent plays at 0.6 of the volume; the rest at 0.3", () => {
    feedback("detent");
    feedback("tick");
    assert.ok(Math.abs((started[0]?.gain ?? 0) - 0.18) < 1e-9);
    assert.equal(started[1]?.gain, 0.3);
  });

  test("a commit's up follows its down 60 ms later", () => {
    feedback("success");
    assert.equal(COMMIT_UP_DELAY_S, 0.06);
    assert.equal(
      (started[1]?.when ?? 0) - (started[0]?.when ?? 0),
      COMMIT_UP_DELAY_S,
    );
  });
});

describe("phases", () => {
  test("press and primary play down on press and up on release", () => {
    feedback("press", { phase: "down" });
    feedback("press", { phase: "up" });
    feedback("primary", { phase: "down" });
    feedback("primary", { phase: "up" });
    assert.deepEqual(heard(), [
      s("asus-kbd-soft", "down"),
      s("asus-kbd-soft", "up"),
      s("asus-kbd-medium", "down"),
      s("asus-kbd-medium", "up"),
    ]);
    assert.deepEqual(vibrated, []);
  });

  test("every other name fires once, at down: an up is a no-op", () => {
    for (const name of ["tick", "success", "toggle", "undo"] as const) {
      feedback(name, { phase: "up" });
    }
    assert.deepEqual(vibrated, []);
    assert.deepEqual(started, []);
  });
});

describe("opt-outs and settings", () => {
  test("{ haptic: false } and { sound: false } skip their half", () => {
    feedback("tick", { haptic: false });
    assert.deepEqual(vibrated, []);
    assert.equal(started.length, 1);
    feedback("tick", { sound: false });
    assert.deepEqual(vibrated, [[10]]);
    assert.equal(started.length, 1);
  });

  test("Sounds off silences sound and keeps haptics", () => {
    setFeedbackSettings({ sounds: false });
    feedback("success");
    assert.deepEqual(started, []);
    assert.deepEqual(vibrated, [[12, 40, 18]]);
  });

  test("Haptics off silences haptics and keeps sound", () => {
    setFeedbackSettings({ haptics: false });
    feedback("success");
    assert.deepEqual(vibrated, []);
    assert.equal(started.length, 2);
  });

  test("both default on, stored only as off, and read back", () => {
    assert.deepEqual(feedbackSettings(), { sounds: true, haptics: true });
    setFeedbackSettings({ sounds: false, haptics: false });
    assert.equal(window.localStorage.getItem(SOUNDS_KEY), "off");
    assert.equal(window.localStorage.getItem(HAPTICS_KEY), "off");
    assert.deepEqual(feedbackSettings(), { sounds: false, haptics: false });
    /* A stable snapshot for useSyncExternalStore. */
    assert.equal(feedbackSettings(), feedbackSettings());
    setFeedbackSettings({ sounds: true });
    assert.equal(window.localStorage.getItem(SOUNDS_KEY), null);
  });

  test("turning one on answers with a tick of that kind; off is silent", () => {
    setFeedbackSettings({ haptics: false, sounds: false });
    assert.deepEqual(vibrated, []);
    assert.deepEqual(started, []);
    setFeedbackSettings({ haptics: true });
    assert.deepEqual(vibrated, [[10]]);
    assert.deepEqual(started, []);
    setFeedbackSettings({ sounds: true });
    assert.deepEqual(heard(), [s("asus-kbd-soft", "down")]);
    /* Already on: no second answer. */
    setFeedbackSettings({ haptics: true, sounds: true });
    assert.equal(vibrated.length, 1);
    assert.equal(started.length, 1);
  });
});

describe("never throws", () => {
  test("with no vibrate, no audio and storage that throws", () => {
    Reflect.deleteProperty(window, "AudioContext");
    resetAudio();
    Object.defineProperty(proto, "vibrate", {
      value: () => {
        throw new Error("blocked");
      },
      configurable: true,
    });
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("SecurityError");
    };
    try {
      for (const name of Object.keys(CUES) as FeedbackName[]) {
        assert.doesNotThrow(() => feedback(name));
        assert.doesNotThrow(() => feedback(name, { phase: "up" }));
      }
      assert.deepEqual(feedbackSettings(), { sounds: true, haptics: true });
    } finally {
      Storage.prototype.getItem = getItem;
    }
  });

  test("for a name it does not know", () => {
    assert.doesNotThrow(() => feedback("nope" as FeedbackName));
  });
});
