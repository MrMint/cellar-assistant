/**
 * Render tests for the restored `EnumSelect`: a required-aware labelled
 * select (a `combobox`), the old "Choose one…" / "Loading…" placeholders, and
 * disabled while loading. Asserted through the label/`for` pairing, roles and
 * `aria-*`, so the same tests hold for Joy's `Select` and Radix's.
 *
 * `useReferenceOptions` is replaced so the test controls the reference data
 * without a GraphQL server; everything between it and the markup — `useEnum`,
 * the option adapter, the formatters — is the real code.
 */

import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { stripStyleBlocks } from "@/test-support/markup";

let fetching = false;
mock.module("@/components/item-api/useReferenceOptions", () => ({
  useReferenceOptions: () => ({
    optionsFor: () => [
      { value: "ROSE", comment: null },
      { value: "RED", comment: null },
    ],
    countries: [],
    fetching,
    error: undefined,
  }),
}));

const { EnumSelect } = await import("./EnumSelect");
const { isDisabled, openTag } = await import("@/test-support/markup");

const render = (node: ReactNode) =>
  stripStyleBlocks(renderToStaticMarkup(node));

function Harness(props: {
  enumKey: Parameters<typeof EnumSelect>[0]["enumKey"];
  required?: boolean;
  value?: string;
}) {
  const { control } = useForm<{ field: string | null }>({
    defaultValues: { field: props.value ?? null },
  });
  return (
    <EnumSelect
      name="field"
      control={control}
      enumKey={props.enumKey}
      label="Style"
      required={props.required}
    />
  );
}

describe("EnumSelect (restored)", () => {
  test("FormControl > FormLabel + Select, old placeholder", () => {
    fetching = false;
    const html = render(<Harness enumKey="wineStyle" />);
    const id = /<label[^>]*for="([^"]+)"[^>]*>Style</.exec(html)?.[1];
    assert.ok(id, "the label names its control");
    assert.match(openTag(html, `id="${id}"`), /\srole="combobox"/);
    assert.ok(html.indexOf(">Style<") < html.indexOf('role="combobox"'));
    assert.match(html, />Choose one…</);
    assert.equal(isDisabled(openTag(html, 'role="combobox"')), false);
  });

  test("F-2: the field and trigger can shrink, so a long value never overflows 390", () => {
    fetching = false;
    const html = render(<Harness enumKey="wineStyle" />);
    assert.match(openTag(html, 'data-slot="field"'), /\bmin-w-0\b/);
    assert.match(openTag(html, 'role="combobox"'), /\bmin-w-0\b/);
  });

  test("loading: Loading… placeholder and disabled", () => {
    fetching = true;
    const html = render(<Harness enumKey="wineStyle" />);
    assert.match(html, />Loading…</);
    assert.equal(isDisabled(openTag(html, 'role="combobox"')), true);
  });

  test("static enums never wait on the reference query", () => {
    fetching = true;
    const html = render(<Harness enumKey="coffeeRoastLevel" />);
    assert.match(html, />Choose one…</);
  });

  test("required marks the control and label", () => {
    fetching = false;
    const html = render(<Harness enumKey="wineStyle" required />);
    assert.match(
      html,
      /<label[^>]*>Style<span[^>]*aria-hidden="true"[^>]*>\s*\*/,
    );
  });

  test("the Controller binds the select to the form field's name", () => {
    // Options register from an effect (Joy's did too, and Radix mounts its
    // items into a fragment after hydration), so a server render shows
    // neither the selected label nor its value — only the binding: the hidden
    // native control named for the field. Labels are covered by
    // enum-options.test.ts.
    fetching = false;
    const html = render(<Harness enumKey="wineStyle" value="ROSE" />);
    assert.match(
      html,
      /<(?:input|select)\b[^>]*aria-hidden="true"[^>]*name="field"/,
    );
    // A held value is not the placeholder.
    assert.doesNotMatch(html, />Choose one…</);
  });
});
