/**
 * The edit form lost every country past the first page of countries: Joy's
 * Select (MUI Base `useList`) drops a selected value its options lack each
 * time the options change and reports it as `onChange(null)`, so a form
 * mounted while the second page of countries was still loading cleared its
 * own `country`, and Save sent `null` (UX lane, 2026-10-08: UNITED_STATES →
 * NULL on an untouched Save). This drives the real `EnumSelect` inside a real
 * `useForm` with the options arriving the way `useReferenceOptions` delivers
 * them — none, then page one, then both pages — and checks the field's value.
 */

import { mock } from "bun:test";
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/wines/1/edit" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Options = { value: string; label: string }[];
let current: { options: Options; loading: boolean } = {
  options: [],
  loading: true,
};
mock.module("@/hooks/useEnum", () => ({
  useEnum: () => ({ ...current, error: null }),
}));

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { useForm } = await import("react-hook-form");
const { EnumSelect } = await import("./EnumSelect");

const opt = (value: string, label: string) => ({ value, label });
const PAGE_ONE: Options = [opt("FRANCE", "France"), opt("ITALY", "Italy")];
const PAGE_TWO: Options = [opt("UNITED_STATES", "United States")];

type Values = { country: string };
let read: () => Values = () => ({ country: "unset" });

function Form({ initial }: { initial: string }) {
  const { control, getValues } = useForm<Values>({
    defaultValues: { country: initial },
  });
  read = getValues;
  return (
    <EnumSelect
      name="country"
      control={control}
      enumKey="country"
      label="Country"
    />
  );
}

const container = document.createElement("div");
document.body.appendChild(container);
const root = createRoot(container);

const render = async (initial: string) => {
  await act(async () => {
    root.render(<Form initial={initial} />);
  });
};
const deliver = async (options: Options, loading = false) => {
  current = { options, loading };
  await act(async () => {
    root.render(<Form initial="ignored-after-mount" />);
  });
};

after(async () => {
  await act(async () => root.unmount());
});

describe("EnumSelect keeps a stored value its options do not have yet", () => {
  test("a country on the second page survives the first page arriving", async () => {
    current = { options: [], loading: true };
    await render("UNITED_STATES");
    await deliver(PAGE_ONE, true);
    assert.equal(read().country, "UNITED_STATES");
    await deliver([...PAGE_ONE, ...PAGE_TWO]);
    assert.equal(read().country, "UNITED_STATES");
    assert.match(container.textContent ?? "", /United States/);
  });

  test("a first-page country is untouched", async () => {
    await act(async () => root.render(null));
    current = { options: [], loading: true };
    await render("FRANCE");
    await deliver(PAGE_ONE, true);
    await deliver([...PAGE_ONE, ...PAGE_TWO]);
    assert.equal(read().country, "FRANCE");
  });

  test("a blank country stays blank", async () => {
    await act(async () => root.render(null));
    current = { options: [], loading: true };
    await render("");
    await deliver([...PAGE_ONE, ...PAGE_TWO]);
    // Joy reports "no selection" as null; ItemForm sends either as null.
    assert.equal(read().country ?? "", "");
  });
});
