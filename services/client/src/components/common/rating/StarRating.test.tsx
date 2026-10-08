/**
 * The N30 rating control: what assistive tech and touch see in the markup,
 * and the keyboard and tap behaviour of its hook.
 *
 * There is no DOM in this suite (server render only), so the hook is driven
 * by calling the handlers it returns with minimal event objects — the same
 * calls React makes, minus the browser.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StarRating, StarRatingDisplay } from "./StarRating";
import { useStarRatingInput } from "./useStarRatingInput";

const render = (node: ReactNode) =>
  renderToStaticMarkup(node).replace(/<style[^>]*>[^<]*<\/style>/g, "");

const radios = (html: string) =>
  [...html.matchAll(/<input[^>]*>/g)].map((m) => ({
    type: /type="([^"]+)"/.exec(m[0])?.[1],
    name: /name="([^"]+)"/.exec(m[0])?.[1],
    value: /value="([^"]+)"/.exec(m[0])?.[1],
    label: /aria-label="([^"]+)"/.exec(m[0])?.[1],
    checked: / checked=""/.test(m[0]),
    disabled: / disabled=""/.test(m[0]),
  }));

describe("StarRating markup", () => {
  test("a named radiogroup of ten native radios, half steps 0.5–5", () => {
    const html = render(<StarRating value={null} onChange={() => {}} />);
    assert.match(html, /role="radiogroup"[^>]*aria-label="Your score"/);
    const r = radios(html);
    assert.equal(r.length, 10);
    assert.ok(r.every((x) => x.type === "radio"));
    assert.equal(new Set(r.map((x) => x.name)).size, 1, "one group name");
    assert.deepEqual(
      r.map((x) => x.value),
      ["0.5", "1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5"],
    );
    assert.equal(r[0]?.label, "0.5 stars, Terrible");
    assert.equal(r[1]?.label, "1 star, Bad");
    assert.equal(r[9]?.label, "5 stars, Outstanding");
    assert.ok(r.every((x) => !x.checked));
    assert.match(html, /Tap a star to rate/);
  });

  test("nothing hides the control from VoiceOver or swallows a scroll", () => {
    const html = render(<StarRating value={3} onChange={() => {}} />);
    // Only the decorative glyphs are aria-hidden — never the group or a radio.
    for (const m of html.matchAll(/<[a-z]+[^>]*aria-hidden="true"[^>]*>/g)) {
      assert.match(m[0], /^<svg |^<span[^>]*class="ca-rating__glyph"/);
    }
    assert.doesNotMatch(html, /touch-action:\s*none/);
    assert.doesNotMatch(html, /onpointerleave|onmouseleave/i);
  });

  test("the checked radio is the value; stars fill to it", () => {
    const html = render(<StarRating value={3.5} onChange={() => {}} />);
    const checked = radios(html).filter((x) => x.checked);
    assert.deepEqual(
      checked.map((x) => x.value),
      ["3.5"],
    );
    const fills = [...html.matchAll(/data-fraction="([^"]+)"/g)].map((m) =>
      Number(m[1]),
    );
    assert.deepEqual(fills, [1, 1, 1, 0.5]);
    assert.match(html, /3\.5 · Good\+</);
  });

  test("a whole value offers the half; an off-step value is snapped", () => {
    assert.match(
      render(<StarRating value={4} onChange={() => {}} />),
      /4 · Very Good — tap again for a half/,
    );
    const html = render(<StarRating value={3.7} onChange={() => {}} />);
    assert.deepEqual(
      radios(html)
        .filter((x) => x.checked)
        .map((x) => x.value),
      ["3.5"],
    );
  });

  test("each star is a 44 pt target; focus shows on the star", () => {
    const html = renderToStaticMarkup(
      <StarRating value={null} onChange={() => {}} />,
    );
    assert.equal([...html.matchAll(/class="ca-rating__star"/g)].length, 5);
    assert.match(html, /--ca-rating-target:44px/);
    assert.match(html, /min-width:var\(--ca-rating-target\)/);
    assert.match(html, /min-height:var\(--ca-rating-target\)/);
    assert.match(
      html,
      /\.ca-rating__star:has\(\.ca-rating__radio:focus-visible\)\{outline:2px solid/,
    );
    assert.match(html, /touch-action:manipulation/);
  });

  test("disabled disables every radio", () => {
    const html = render(<StarRating value={2} onChange={() => {}} disabled />);
    assert.ok(radios(html).every((x) => x.disabled));
    assert.match(html, /aria-disabled="true"/);
  });

  test("Clear shows only when clearable and rated", () => {
    const noop = () => {};
    assert.doesNotMatch(
      render(<StarRating value={2} onChange={noop} />),
      /Clear rating/,
    );
    assert.doesNotMatch(
      render(<StarRating value={null} onChange={noop} onClear={noop} />),
      /Clear rating/,
    );
    assert.match(
      render(<StarRating value={2} onChange={noop} onClear={noop} />),
      /Clear rating/,
    );
  });
});

describe("StarRatingDisplay", () => {
  test("one image named with the score; glyphs are decorative", () => {
    const html = render(<StarRatingDisplay value={4.5} />);
    assert.match(
      html,
      /^<span[^>]*role="img"[^>]*aria-label="Rated 4.5 out of 5"/,
    );
    assert.doesNotMatch(html, /<input/);
    assert.equal([...html.matchAll(/class="ca-rating__glyph"/g)].length, 5);
  });

  test("no score reads as not rated", () => {
    assert.match(
      render(<StarRatingDisplay value={null} />),
      /aria-label="Not rated"/,
    );
  });
});

type Handlers = ReturnType<typeof useStarRatingInput>;

/** Run the hook once (a server render) and hand back what it returned. */
function hook(options: Parameters<typeof useStarRatingInput>[0]): Handlers {
  let out: Handlers | undefined;
  function Probe() {
    out = useStarRatingInput(options);
    return null;
  }
  renderToStaticMarkup(<Probe />);
  assert.ok(out);
  return out;
}

function key(
  h: Handlers,
  k: string,
  mods: { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {},
) {
  let prevented = false;
  h.onKeyDown({
    key: k,
    ...mods,
    preventDefault: () => {
      prevented = true;
    },
  } as never);
  return prevented;
}

function click(h: Handlers, star: number, tagName = "svg") {
  h.onStarClick(star)({ target: { tagName } } as never);
}

describe("useStarRatingInput", () => {
  test("arrow keys change the value by halves and cancel the native move", () => {
    const seen: number[] = [];
    const h = hook({ value: 3, onChange: (v) => seen.push(v) });
    assert.equal(key(h, "ArrowRight"), true);
    assert.equal(key(h, "ArrowLeft"), true);
    assert.equal(key(h, "ArrowDown"), true);
    assert.equal(key(h, "End"), true);
    assert.deepEqual(seen, [3.5, 2.5, 3.5, 5]);
  });

  test("at an end the key is still consumed (no wrap) but nothing changes", () => {
    const seen: number[] = [];
    const h = hook({ value: 5, onChange: (v) => seen.push(v) });
    assert.equal(key(h, "ArrowRight"), true);
    assert.deepEqual(seen, []);
  });

  test("Tab, Space and Enter are left alone", () => {
    const seen: number[] = [];
    const h = hook({ value: 3, onChange: (v) => seen.push(v) });
    for (const k of ["Tab", " ", "Enter"]) assert.equal(key(h, k), false, k);
    assert.deepEqual(seen, []);
  });

  test("a chord with Alt, Ctrl or Meta is left to the browser", () => {
    const seen: number[] = [];
    const h = hook({ value: 3, onChange: (v) => seen.push(v) });
    assert.equal(key(h, "ArrowLeft", { altKey: true }), false, "Alt+Left");
    assert.equal(key(h, "ArrowRight", { metaKey: true }), false, "Cmd+Right");
    assert.equal(key(h, "Home", { ctrlKey: true }), false, "Ctrl+Home");
    assert.deepEqual(seen, []);
  });

  test("Clear clears and keeps focus in the group", () => {
    let cleared = 0;
    let focused = false;
    const h = hook({
      value: 3,
      onChange: () => {},
      onClear: () => {
        cleared += 1;
      },
    });
    h.radioRef(0.5)({
      focus: () => {
        focused = true;
      },
    } as never);
    h.clear();
    assert.equal(cleared, 1);
    assert.ok(focused, "focus moved to the first radio, not to <body>");
  });

  test("a disabled Clear does nothing", () => {
    let cleared = 0;
    const h = hook({
      value: 3,
      onChange: () => {},
      onClear: () => {
        cleared += 1;
      },
      disabled: true,
    });
    h.clear();
    assert.equal(cleared, 0);
  });

  test("taps set a star, then its half", () => {
    const seen: number[] = [];
    click(hook({ value: null, onChange: (v) => seen.push(v) }), 4);
    click(hook({ value: 4, onChange: (v) => seen.push(v) }), 4);
    click(hook({ value: 3.5, onChange: (v) => seen.push(v) }), 4);
    assert.deepEqual(seen, [4, 3.5, 4]);
  });

  test("a radio's own click bubbling to its star is not applied twice", () => {
    const seen: number[] = [];
    click(hook({ value: 4, onChange: (v) => seen.push(v) }), 4, "INPUT");
    assert.deepEqual(seen, []);
  });

  test("a radio change commits its value", () => {
    const seen: number[] = [];
    const h = hook({ value: null, onChange: (v) => seen.push(v) });
    h.onRadioChange({ currentTarget: { value: "2.5" } } as never);
    assert.deepEqual(seen, [2.5]);
  });

  test("disabled ignores keys, taps and changes", () => {
    const seen: number[] = [];
    const h = hook({ value: 3, onChange: (v) => seen.push(v), disabled: true });
    assert.equal(key(h, "ArrowRight"), false);
    click(h, 5);
    h.onRadioChange({ currentTarget: { value: "1" } } as never);
    assert.deepEqual(seen, []);
  });
});
