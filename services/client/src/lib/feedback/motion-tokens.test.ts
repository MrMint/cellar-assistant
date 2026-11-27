/**
 * `lib/motion.ts` against motion/SPEC.md § Tokens and § Gestures (MC-motion),
 * the view-transition CSS against the same numbers, and the sounds' offline
 * story: only the files used, with the MIT licence, cached by the worker.
 * Lives beside `lib/feedback` because F3 owns both (Fettle kept its haptic
 * and motion token checks in one file too).
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  calm,
  distance,
  dur,
  ease,
  exitOf,
  gesture,
  hold,
  press,
  reduced,
  refreshMs,
  skeleton,
  spring,
  stagger,
  staggerDelay,
  toastMs,
  tween,
  tweenOut,
} from "../motion";
import { runtimeCaching, SOUNDS_CACHE } from "../pwa/runtime-caching";
import { SOUNDS, soundUrl } from "./sound";

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe("motion tokens: SPEC § Tokens", () => {
  test("durations: micro 90, short 160, medium 240, long 400, celebrate 700; exits at ⅔", () => {
    assert.deepEqual(dur, {
      micro: 0.09,
      short: 0.16,
      medium: 0.24,
      long: 0.4,
      celebrate: 0.7,
    });
    assert.ok(close(exitOf(dur.long), 0.4 * (2 / 3)));
    assert.deepEqual(tweenOut("long"), {
      duration: exitOf(dur.long),
      ease: ease.exit,
    });
    assert.deepEqual(tween("short"), {
      duration: 0.16,
      ease: ease.standard,
    });
  });

  test("curves: standard (.2,0,0,1), enter (0,0,0,1), exit (.3,0,1,1)", () => {
    assert.deepEqual(ease, {
      standard: [0.2, 0, 0, 1],
      enter: [0, 0, 0, 1],
      exit: [0.3, 0, 1, 1],
    });
  });

  test("springs: snappy 520/42, sheet 380/36, celebrate 300/18", () => {
    assert.deepEqual(spring, {
      snappy: { type: "spring", stiffness: 520, damping: 42 },
      sheet: { type: "spring", stiffness: 380, damping: 36 },
      celebrate: { type: "spring", stiffness: 300, damping: 18 },
    });
  });

  test("distances: route 60, list 8, press .97, lift 1.03, sheetFrom .94, fan 56", () => {
    assert.deepEqual(distance, {
      route: 60,
      list: 8,
      press: 0.97,
      lift: 1.03,
      sheetFrom: 0.94,
      fan: 56,
    });
    assert.equal(press, 0.97);
  });

  test("time: skeleton after 120 held 300, refresh 900, toast 5000, stagger 30 × 6", () => {
    assert.deepEqual(skeleton, { afterMs: 120, holdMs: 300 });
    assert.equal(refreshMs, 900);
    assert.equal(toastMs, 5000);
    assert.deepEqual(stagger, { each: 0.03, max: 6 });
    assert.equal(staggerDelay(0), 0);
    assert.ok(close(staggerDelay(2), 0.06));
    /* Rows past the sixth arrive with the sixth. */
    assert.ok(close(staggerDelay(5), 0.15));
    assert.ok(close(staggerDelay(40), 0.15));
    assert.equal(staggerDelay(-3), 0);
  });

  test("reduced motion: a cross-fade at micro, opacity only; calm fade 150, sheet 120", () => {
    assert.deepEqual(reduced.transition, {
      duration: dur.micro,
      ease: ease.standard,
    });
    for (const state of [reduced.initial, reduced.animate, reduced.exit]) {
      assert.deepEqual(Object.keys(state), ["opacity"]);
    }
    assert.deepEqual(calm, { fade: 0.15, sheet: 0.12 });
  });
});

describe("motion tokens: SPEC § Gestures", () => {
  test("every threshold, by name and unit", () => {
    assert.deepEqual(gesture, {
      claimPx: 6,
      slopPx: 10,
      edgePx: 20,
      backAt: 0.35,
      flingPxPerMs: 0.5,
      vmaxPxPerMs: 5,
      projectMs: 200,
      rubber: 0.2,
      liftMs: 150,
      holdMs: 400,
      armMs: 250,
      pullPx: 64,
      pullK: 0.5,
      swipeAt: 0.3,
      dismissAt: 0.3,
      decayTauMs: 325,
    });
    assert.deepEqual(hold, { liftMs: 150, openMs: 400 });
  });
});

describe("view-transitions.css follows SPEC's route transitions", () => {
  const css = readFileSync(
    fileURLToPath(new URL("../../app/view-transitions.css", import.meta.url)),
    "utf8",
  );

  test("a route drifts `distance.route` px", () => {
    assert.match(css, new RegExp(`--ca-route-offset:\\s*${distance.route}px`));
  });

  test("a back runs at ⅔ of long, on the exit curve", () => {
    assert.match(
      css,
      /--ca-route-back:\s*calc\(var\(--ca-dur-long\) \* 2 \/ 3\)/,
    );
    const back = css.slice(css.indexOf("::view-transition-old(.nav-back)"));
    assert.match(
      back.slice(0, 300),
      /var\(--ca-route-back\) var\(--ca-ease-exit\)/,
    );
  });

  test("reduced motion keeps only fades, at calm's 150 and 120 ms", () => {
    assert.match(css, new RegExp(`--ca-calm-fade:\\s*${calm.fade * 1000}ms`));
    assert.match(css, new RegExp(`--ca-calm-sheet:\\s*${calm.sheet * 1000}ms`));
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion"));
    assert.ok(block.length > 0);
    assert.doesNotMatch(block, /ca-route-slide/);
  });
});

describe("sounds: self-hosted, licensed, offline", () => {
  const dir = fileURLToPath(
    new URL("../../../public/sounds/", import.meta.url),
  );

  test("public/sounds holds only the files used, and the MIT licence", () => {
    const want = [
      ...Object.keys(SOUNDS).map((n) => `${n}.mp3`),
      "LICENSE",
    ].sort();
    assert.deepEqual(readdirSync(dir).sort(), want);
    const licence = readFileSync(`${dir}LICENSE`, "utf8");
    assert.match(licence, /MIT License/);
    assert.match(licence, /Josh Comeau/);
    assert.match(licence, /button-sounds/);
  });

  test("every sound URL is caught by the worker's sound rule, ahead of the catch-alls", () => {
    const origin = "http://localhost";
    for (const name of Object.keys(SOUNDS) as (keyof typeof SOUNDS)[]) {
      const url = new URL(soundUrl(name), origin);
      const request = new Request(url);
      const index = runtimeCaching.findIndex((entry) => {
        const m = entry.matcher;
        if (typeof m !== "function") return false;
        return Boolean(
          m({
            url,
            request,
            sameOrigin: true,
            event: {} as never,
          } as never),
        );
      });
      const entry = runtimeCaching[index];
      assert.ok(entry, `${name} matched no rule`);
      const handler = entry.handler as { cacheName?: string };
      assert.equal(handler.cacheName, SOUNDS_CACHE, name);
    }
  });
});
