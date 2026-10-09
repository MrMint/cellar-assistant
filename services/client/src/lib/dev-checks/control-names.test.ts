/**
 * X21 · the control-name guard: `control-names.ts` has the rule and why.
 *
 * If this fails: the control named has nothing a screen reader can announce —
 * an icon alone inside a `<button>`, `Button` or link. Use `app/IconButton`
 * (whose `aria-label` the type checker requires), or give the element an
 * `aria-label`, or visible / `sr-only` text.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { scanAllControlNames, scanControlNames } from "./control-names";

const scan = (body: string) =>
  scanControlNames("fixture.tsx", `export const X = () => (${body});`).map(
    (f) => f.tag,
  );

describe("control-name guard: what it flags", () => {
  test("an icon alone in a button, Button, link or Radix trigger", () => {
    assert.deepEqual(scan(`<button onClick={go}><Close /></button>`), [
      "button",
    ]);
    assert.deepEqual(
      scan(`<Button size="icon"><Share className="size-4" /></Button>`),
      ["Button"],
    );
    assert.deepEqual(scan(`<Link href="/map"><MapIcon /></Link>`), ["Link"]);
    assert.deepEqual(scan(`<a href="/x"><svg /></a>`), ["a"]);
    assert.deepEqual(scan(`<DrawerClose><Close /></DrawerClose>`), [
      "DrawerClose",
    ]);
    assert.deepEqual(scan(`<div role="button" onClick={go}><More /></div>`), [
      "div",
    ]);
  });

  test("hidden or empty names do not count", () => {
    assert.deepEqual(scan(`<button aria-label=""><Close /></button>`), [
      "button",
    ]);
    assert.deepEqual(scan(`<button><span aria-hidden>×</span></button>`), [
      "button",
    ]);
    assert.deepEqual(scan(`<button><img alt="" src="x" /></button>`), [
      "button",
    ]);
    assert.deepEqual(scan(`<button />`), ["button"]);
  });

  test("an unnamed asChild parent leaves its child unnamed", () => {
    assert.deepEqual(
      scan(`<IconButton asChild><Link href="/"><Back /></Link></IconButton>`),
      ["Link"],
    );
  });
});

describe("control-name guard: what it leaves alone", () => {
  test("text, an expression, sr-only text or a labelled descendant", () => {
    assert.deepEqual(scan(`<button>Save</button>`), []);
    assert.deepEqual(
      scan(`<Button><Add aria-hidden /> Add bottle</Button>`),
      [],
    );
    assert.deepEqual(scan(`<Link href={href}>{name}</Link>`), []);
    assert.deepEqual(
      scan(`<button><Close /><span className="sr-only">Close</span></button>`),
      [],
    );
    assert.deepEqual(scan(`<button><img alt="Barolo" src="x" /></button>`), []);
    assert.deepEqual(scan(`<button><>{label}</></button>`), []);
  });

  test("a naming attribute, a spread, an id a label can point at", () => {
    assert.deepEqual(scan(`<button aria-label="Close"><Close /></button>`), []);
    assert.deepEqual(
      scan(`<button aria-labelledby="t"><Close /></button>`),
      [],
    );
    assert.deepEqual(scan(`<button title="Close"><Close /></button>`), []);
    assert.deepEqual(scan(`<button {...props}><Close /></button>`), []);
    assert.deepEqual(
      scan(`<SelectTrigger id={id}><SelectValue /></SelectTrigger>`),
      [],
    );
  });

  test("a named asChild parent names the child it renders", () => {
    assert.deepEqual(
      scan(
        `<IconButton asChild aria-label="Back"><Link href="/"><Back /></Link></IconButton>`,
      ),
      [],
    );
  });

  test("an icon-like component with a label prop is taken as text", () => {
    assert.deepEqual(
      scan(`<button><UserAvatar displayName={n} /></button>`),
      [],
    );
  });
});

describe("control-name guard (absolute)", () => {
  test("no control in src/ is certainly unnamed", () => {
    const found = scanAllControlNames();
    assert.deepEqual(
      found.map((f) => `${f.file}:${f.line} <${f.tag}>`),
      [],
      "unnamed controls (see this file's header)",
    );
  });
});
