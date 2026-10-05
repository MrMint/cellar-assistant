/**
 * Render tests for the restored `EnumSelect`: a required-aware Joy
 * `FormControl` with a `FormLabel` and a `Select`, the old "Choose one…" /
 * "Loading…" placeholders, and disabled while loading.
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

const render = (node: ReactNode) =>
  renderToStaticMarkup(node).replace(/<style[^>]*>[^<]*<\/style>/g, "");

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
    assert.match(html, /^<div class="MuiFormControl-root/);
    assert.match(html, /<label[^>]*class="MuiFormLabel-root[^"]*"[^>]*>Style</);
    assert.match(html, /MuiSelect-root/);
    assert.match(html, />Choose one…</);
    assert.doesNotMatch(html, /Mui-disabled/);
  });

  test("loading: Loading… placeholder and disabled", () => {
    fetching = true;
    const html = render(<Harness enumKey="wineStyle" />);
    assert.match(html, />Loading…</);
    assert.match(html, /MuiSelect-root[^"]*Mui-disabled/);
  });

  test("static enums never wait on the reference query", () => {
    fetching = true;
    const html = render(<Harness enumKey="coffeeRoastLevel" />);
    assert.match(html, />Choose one…</);
  });

  test("required marks the control and label", () => {
    fetching = false;
    const html = render(<Harness enumKey="wineStyle" required />);
    assert.match(html, /MuiFormLabel-asterisk/);
  });

  test("the Controller binds the select to the form field's name", () => {
    // Joy registers options in an effect, so a server render shows neither the
    // selected label nor its value — only the binding. Labels are covered by
    // enum-options.test.ts.
    fetching = false;
    const html = render(<Harness enumKey="wineStyle" value="ROSE" />);
    assert.match(html, /<input[^>]*aria-hidden="true"[^>]*name="field"/);
  });
});
