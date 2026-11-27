/**
 * Haptics, ported from Fettle's `motion-haptics.test.ts` (DECISIONS 36).
 *
 * The iPhone path: with no `navigator.vibrate`, `haptic()` clicks the hidden
 * switch's label once per pulse, the first click inside the dispatch of the
 * gesture that asked for it, never outside one, never with the Haptics
 * setting off. Reduced motion does not silence it, but plays a celebration as
 * one beat. iOS 26.5+ ticks only for a real tap on a switch, so a press is
 * felt through an overlay switch the finger lands on (`attachHapticOverlay`):
 * one click handed to the element underneath, its activation intact, nothing
 * of the switch's own reaching the page, and no second tick from the hidden
 * switch for the pulse the finger already played. Whether iOS ticks at all is
 * a device's to say; nothing headless can. Android: `vibrate` takes the
 * whole pattern.
 */
import { jest } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register({ url: "http://localhost/" });
}

const {
  attachHapticOverlay,
  calmed,
  clampPattern,
  HAPTIC,
  HAPTIC_PATTERN_MAX_MS,
  HAPTIC_PULSE_MAX_MS,
  haptic,
  hapticOverlayLive,
  inGesture,
  pulseOffsets,
  registerHapticSwitch,
  subscribeHaptics,
} = await import("./haptics");
const { HAPTICS_KEY, setHapticsEnabled } = await import("./settings");
type HapticKind = import("./haptics").HapticKind;

interface Click {
  readonly at: number;
  readonly inside: boolean;
  readonly during: string | null;
}

const KINDS = Object.keys(HAPTIC) as HapticKind[];

let label: HTMLLabelElement;
let clicks: Click[];
let teardown: () => void;
let current: Event | null;
const proto = Object.getPrototypeOf(navigator) as object;
const vibrate = Object.getOwnPropertyDescriptor(proto, "vibrate");
const touch = Object.getOwnPropertyDescriptor(proto, "maxTouchPoints");
let reduced = false;
const realMatchMedia = window.matchMedia;

function setVibrate(value: unknown): void {
  Object.defineProperty(proto, "vibrate", { value, configurable: true });
}
function touchPoints(n: number): void {
  Object.defineProperty(proto, "maxTouchPoints", {
    get: () => n,
    configurable: true,
  });
}

function mount(): void {
  label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  label.append(input);
  document.body.append(label);
  clicks = [];
  label.addEventListener("click", (event) => {
    /* The label's activation clicks its input too, and that bubbles back. */
    if (event.target !== label) return;
    clicks.push({
      at: Date.now(),
      inside: inGesture(),
      during: current?.type ?? null,
    });
  });
  teardown = registerHapticSwitch(label);
}

/** A button whose handler asks for `kind` inside its own event. */
function button(
  kind: HapticKind,
  type: "click" | "pointerdown" = "click",
): HTMLButtonElement {
  const b = document.createElement("button");
  b.addEventListener(type, (event) => {
    current = event;
    haptic(kind);
    current = null;
  });
  document.body.append(b);
  return b;
}

beforeEach(() => {
  jest.useFakeTimers();
  /* An iPhone: no `vibrate` anywhere on the prototype chain. */
  setVibrate(undefined);
  window.localStorage.removeItem(HAPTICS_KEY);
  reduced = false;
  window.matchMedia = ((q: string) =>
    ({
      matches: reduced && q.includes("reduce"),
    }) as MediaQueryList) as typeof window.matchMedia;
  current = null;
  mount();
});

afterEach(() => {
  teardown();
  document.body.replaceChildren();
  if (vibrate) Object.defineProperty(proto, "vibrate", vibrate);
  else Reflect.deleteProperty(proto, "vibrate");
  if (touch) Object.defineProperty(proto, "maxTouchPoints", touch);
  window.matchMedia = realMatchMedia;
  jest.useRealTimers();
});

describe("the vocabulary", () => {
  test("is Fettle's eight patterns, by name", () => {
    assert.deepEqual(HAPTIC, {
      tick: [10],
      detent: [8],
      hold: [14],
      undo: [8, 30, 8],
      success: [12, 40, 18],
      medium: [14, 50, 14, 50, 20],
      big: [18, 60, 18, 60, 30, 90, 40],
      refuse: [30, 40, 30],
    });
  });

  test("every pattern is inside the per-pulse and per-pattern caps", () => {
    for (const kind of KINDS) {
      const pattern = HAPTIC[kind];
      const pulses = pattern.filter((_, i) => i % 2 === 0);
      assert.ok(Math.max(...pulses) <= HAPTIC_PULSE_MAX_MS, kind);
      const total = pattern.reduce<number>((a, b) => a + b, 0);
      assert.ok(total <= HAPTIC_PATTERN_MAX_MS, kind);
      assert.deepEqual(clampPattern(pattern), [...pattern], kind);
    }
  });

  test("keeps the everyday pulses in Android's 8 to 20 ms band", () => {
    for (const kind of [
      "tick",
      "detent",
      "hold",
      "undo",
      "success",
      "medium",
    ] as const) {
      const pulses = HAPTIC[kind].filter((_, i) => i % 2 === 0);
      assert.ok(Math.min(...pulses) >= 8, kind);
      assert.ok(Math.max(...pulses) <= 20, kind);
    }
  });

  test("clamps a pulse to 40 ms and a pattern to 400 ms, never ending on a pause", () => {
    assert.deepEqual(clampPattern([100]), [40]);
    assert.deepEqual(clampPattern([10, 200, 10, 200, 10]), [10, 200, 10]);
    assert.deepEqual(clampPattern([0.2]), [1]);
    assert.deepEqual(clampPattern([]), []);
  });

  test("counts one pulse for a tick, two for an undo, four for a big moment", () => {
    assert.equal(pulseOffsets(clampPattern(HAPTIC.tick)).length, 1);
    assert.deepEqual(pulseOffsets(clampPattern(HAPTIC.undo)), [0, 38]);
    assert.equal(pulseOffsets(clampPattern(HAPTIC.big)).length, 4);
  });
});

describe("haptics on an iPhone: the hidden switch", () => {
  for (const kind of KINDS) {
    test(`${kind} clicks the label once per pulse, the first inside the press`, () => {
      const pulses = pulseOffsets(clampPattern(HAPTIC[kind]));
      const start = Date.now();
      button(kind).click();
      assert.equal(clicks.length, 1);
      assert.equal(clicks[0]?.inside, true);
      assert.equal(clicks[0]?.during, "click");
      jest.advanceTimersByTime(500);
      assert.equal(clicks.length, pulses.length);
      /* The chained beats land at the pattern's own offsets, inside 400 ms. */
      assert.deepEqual(
        clicks.map((c) => c.at - start),
        pulses,
      );
      assert.ok(Math.max(...pulses) <= 400);
    });
  }

  test("fires from a pointerdown too, and from a pressed pointer's move", () => {
    button("detent", "pointerdown").dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    assert.equal(clicks.length, 1);
    const plot = document.createElement("div");
    plot.addEventListener("pointermove", () => haptic("detent"));
    document.body.append(plot);
    plot.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, buttons: 1 }),
    );
    assert.equal(clicks.length, 2);
    /* A hover is not a gesture. */
    plot.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, buttons: 0 }),
    );
    assert.equal(clicks.length, 2);
  });

  test("never clicks outside a gesture: on load, after an await, from a timer", async () => {
    assert.equal(haptic("tick"), false);
    const b = document.createElement("button");
    let later: Promise<void> = Promise.resolve();
    b.addEventListener("click", () => {
      later = Promise.resolve().then(() => {
        haptic("success");
      });
      setTimeout(() => haptic("tick"), 10);
    });
    document.body.append(b);
    b.click();
    await later;
    jest.advanceTimersByTime(500);
    assert.equal(clicks.length, 0);
    assert.equal(inGesture(), false);
  });

  test("never clicks with Haptics off, and drops a chain's beats when it goes off", () => {
    window.localStorage.setItem(HAPTICS_KEY, "off");
    button("big").click();
    jest.advanceTimersByTime(500);
    assert.equal(clicks.length, 0);

    window.localStorage.removeItem(HAPTICS_KEY);
    button("big").click();
    window.localStorage.setItem(HAPTICS_KEY, "off");
    jest.advanceTimersByTime(500);
    assert.equal(clicks.length, 1);
  });

  test("still fires under reduced motion: a vibration is not on-screen movement", () => {
    reduced = true;
    button("tick").click();
    assert.equal(clicks.length, 1);
  });

  test("plays success, medium and big as their one strongest beat under reduced motion", () => {
    assert.deepEqual(calmed("success", true), [18]);
    assert.deepEqual(calmed("medium", true), [20]);
    assert.deepEqual(calmed("big", true), [40]);
    assert.deepEqual(calmed("undo", true), HAPTIC.undo);
    assert.deepEqual(calmed("refuse", true), HAPTIC.refuse);
    assert.deepEqual(calmed("medium", false), HAPTIC.medium);
    reduced = true;
    button("medium").click();
    jest.advanceTimersByTime(500);
    assert.equal(clicks.length, 1);
  });

  test("lets a new pattern take over from one still playing", () => {
    button("big").click();
    jest.advanceTimersByTime(20);
    button("tick").click();
    jest.advanceTimersByTime(500);
    assert.equal(clicks.length, 2);
  });

  test("keeps the switch's own clicks from reaching the page", () => {
    let page = 0;
    const onPage = (): void => {
      page += 1;
    };
    document.addEventListener("click", onPage);
    button("tick").click();
    /* The button's click reached the page; the label's did not. */
    assert.equal(page, 1);
    document.removeEventListener("click", onPage);
  });

  test("is silent with no switch mounted, and after its teardown", () => {
    teardown();
    button("tick").click();
    assert.equal(clicks.length, 0);
    mount();
  });
});

describe("haptics on Android: vibrate takes the whole pattern", () => {
  test("vibrates from anywhere and never clicks the switch", () => {
    const calls: unknown[] = [];
    setVibrate((pattern: unknown) => {
      calls.push(pattern);
      return true;
    });
    button("undo").click();
    assert.deepEqual(calls, [[8, 30, 8]]);
    /* Outside a gesture too: a timer, a threshold, after an await. */
    assert.equal(haptic("success"), true);
    assert.deepEqual(calls[1], [12, 40, 18]);
    assert.equal(clicks.length, 0);
  });

  test("is silent with Haptics off, and survives a vibrate that throws", () => {
    let n = 0;
    setVibrate(() => {
      n += 1;
      throw new Error("blocked");
    });
    assert.equal(haptic("tick"), false);
    assert.equal(n, 1);
    window.localStorage.setItem(HAPTICS_KEY, "off");
    assert.equal(haptic("tick"), false);
    assert.equal(n, 1);
  });

  test("plays a celebration as one beat under reduced motion", () => {
    const calls: unknown[] = [];
    setVibrate((pattern: unknown) => {
      calls.push(pattern);
      return true;
    });
    reduced = true;
    haptic("success");
    haptic("undo");
    assert.deepEqual(calls, [[18], [8, 30, 8]]);
  });
});

/** An overlay switch laid in `host` as its last child, wired as `HapticOverlay` wires it. */
function overlay(host: HTMLElement): {
  readonly input: HTMLInputElement;
  readonly detach: () => void;
} {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.setAttribute("aria-hidden", "true");
  input.tabIndex = -1;
  host.append(input);
  return { input, detach: attachHapticOverlay(input) };
}

describe("haptics on iOS 26.5+: the overlay switch the finger lands on", () => {
  test("hands the tap on as exactly one click, whose own haptic adds no second tick", () => {
    const pressed: Event[] = [];
    const b = document.createElement("button");
    b.addEventListener("click", (event) => {
      pressed.push(event);
      assert.equal(haptic("tick"), true);
    });
    document.body.append(b);
    const heard: (EventTarget | null)[] = [];
    const page = (event: Event): void => {
      heard.push(event.target);
    };
    document.addEventListener("click", page);
    const { input } = overlay(b);

    input.click();

    assert.equal(pressed.length, 1);
    assert.equal(pressed[0]?.target, b);
    /* The page heard the press once, as the button's, never the switch's. */
    assert.deepEqual(heard, [b]);
    /* The finger played the tick: the hidden switch is not clicked for it. */
    assert.equal(clicks.length, 0);
    document.removeEventListener("click", page);
  });

  test("keeps a pattern's later beats on the hidden switch (iOS before 26.5 plays them)", () => {
    const b = document.createElement("button");
    b.addEventListener("click", () => haptic("success"));
    document.body.append(b);
    overlay(b).input.click();
    assert.equal(clicks.length, 0);
    jest.advanceTimersByTime(500);
    assert.equal(
      clicks.length,
      pulseOffsets(clampPattern(HAPTIC.success)).length - 1,
    );
  });

  test("leaves no trace after the press: a later haptic is the hidden switch's", () => {
    const b = document.createElement("button");
    document.body.append(b);
    overlay(b).input.click();
    button("tick").click();
    assert.equal(clicks.length, 1);
  });

  test("keeps the switch's input and change from any form listening for edits", () => {
    const form = document.createElement("form");
    const b = document.createElement("button");
    b.type = "button";
    form.append(b);
    document.body.append(form);
    let edits = 0;
    const onEdit = (): void => {
      edits += 1;
    };
    form.addEventListener("input", onEdit);
    form.addEventListener("change", onEdit);
    overlay(b).input.click();
    assert.equal(edits, 0);
  });

  test("still submits a submit button's form, once", () => {
    const form = document.createElement("form");
    let submitted = 0;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitted += 1;
    });
    const b = document.createElement("button");
    b.type = "submit";
    form.append(b);
    document.body.append(form);
    overlay(b).input.click();
    assert.equal(submitted, 1);
  });

  test("still activates a label's radio, so a segmented option changes", () => {
    const host = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "theme";
    let changed = 0;
    radio.addEventListener("change", () => {
      changed += 1;
    });
    host.append(radio, "Dark");
    document.body.append(host);
    overlay(host).input.click();
    assert.equal(radio.checked, true);
    assert.equal(changed, 1);
  });

  test("hands a focus it takes to the element it covers", () => {
    const b = document.createElement("button");
    document.body.append(b);
    overlay(b).input.focus();
    assert.equal(document.activeElement, b);
  });

  test("lets a drag guard's capture listener cancel the handed-on click", () => {
    const face = document.createElement("div");
    face.addEventListener("click", (event) => event.stopPropagation(), {
      capture: true,
    });
    const b = document.createElement("button");
    let pressed = 0;
    b.addEventListener("click", () => {
      pressed += 1;
    });
    face.append(b);
    document.body.append(face);
    overlay(b).input.click();
    assert.equal(pressed, 0);
  });

  test("does nothing once detached", () => {
    const b = document.createElement("button");
    const heard: (EventTarget | null)[] = [];
    b.addEventListener("click", (event) => heard.push(event.target));
    document.body.append(b);
    const { input, detach } = overlay(b);
    detach();
    input.click();
    /* The switch's own click bubbles as any click would: no handing-on. */
    assert.deepEqual(heard, [input]);
  });
});

describe("where an overlay draws", () => {
  test("only on a touch screen with no vibrate, and only with Haptics on", () => {
    touchPoints(5);
    assert.equal(hapticOverlayLive(), true);
    window.localStorage.setItem(HAPTICS_KEY, "off");
    assert.equal(hapticOverlayLive(), false);
    window.localStorage.removeItem(HAPTICS_KEY);
    /* A desk (Safari or Firefox on a Mac): no vibrate, no touch. */
    touchPoints(0);
    assert.equal(hapticOverlayLive(), false);
    /* Android: vibrate takes every haptic, so no overlay. */
    touchPoints(5);
    setVibrate(() => true);
    assert.equal(hapticOverlayLive(), false);
  });

  test("tells its subscribers when the setting moves, here or in another tab", () => {
    let heard = 0;
    const stop = subscribeHaptics(() => {
      heard += 1;
    });
    setHapticsEnabled(false);
    assert.equal(heard, 1);
    window.dispatchEvent(new StorageEvent("storage", { key: HAPTICS_KEY }));
    assert.equal(heard, 2);
    window.dispatchEvent(new StorageEvent("storage", { key: "cellar.theme" }));
    assert.equal(heard, 2);
    stop();
    setHapticsEnabled(true);
    assert.equal(heard, 2);
  });
});
