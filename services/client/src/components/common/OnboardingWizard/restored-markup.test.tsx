/**
 * Render tests for the onboarding flow: the snap-once capture (X05, N21) and
 * the restored pieces it kept — `common/QuickAddCard.tsx` and the old
 * `{T}Form.tsx` in create mode (`82450ad1`).
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";

mock.module("next/image", () => ({
  default: (props: { alt: string }) => (
    <span data-next-image="art" data-alt={props.alt} />
  ),
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/add/wines",
  useSearchParams: () => new URLSearchParams(),
}));

const { ItemOnboarding } = await import("./ItemOnboarding");
const { OnboardingItemForm } = await import("./OnboardingItemForm");
const { QuickAddCard } = await import("../QuickAddCard");
const { formDefaultsFromOnboarding, quickAddDefaultsFrom } = await import(
  "./adapter"
);

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  renderToStaticMarkup(<Provider value={client}>{node}</Provider>).replace(
    /<style[^>]*>[^<]*<\/style>/g,
    "",
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ");
const noop = () => {};

describe("ItemOnboarding (snap-once, X05/N21)", () => {
  test("opens on 'Add Wine' and the one camera, with no step to skip", () => {
    const html = render(<ItemOnboarding type="WINE" />);
    const words = text(html);
    assert.match(words, /Add Wine/);
    assert.match(html, /data-slot="capture-camera"/);
    assert.match(words, /Fill the frame with the front label/);
    assert.match(words, /Type it in instead/);
    // N21: the old step copy and the scanner's debug line are gone.
    assert.doesNotMatch(words, /Lets |Scanning \(|used for display/);
  });

  test("the heading names the type", () => {
    assert.match(text(render(<ItemOnboarding type="TEA" />)), /Add Tea/);
  });

  test("a generic entry asks the type; the surface's mode row sits under the camera", () => {
    const html = render(
      <ItemOnboarding
        type="WINE"
        chooseType
        leading={<button type="button">Close</button>}
        modeRow={<div data-slot="mode-row" />}
      />,
    );
    const words = text(html);
    assert.match(words, /Close[\s\S]*Add a bottle/);
    assert.match(html, /aria-label="What are you adding\?"/);
    for (const type of ["Wine", "Beer", "Spirit", "Sake", "Coffee", "Tea"]) {
      assert.match(words, new RegExp(`\\b${type}\\b`));
    }
    // X06: right under the picture, above the hint and "Type it in instead".
    assert.match(
      html,
      /data-slot="capture-camera"[\s\S]*data-slot="mode-row"[\s\S]*Type it in instead/,
    );
  });

  test("a carried photo stands in for the camera until 'Read this label' (X06)", () => {
    const html = render(
      <ItemOnboarding
        type="BEER"
        chooseType
        initialPhoto="data:image/jpeg;base64,AA=="
      />,
    );
    assert.doesNotMatch(html, /data-slot="capture-camera"/);
    assert.match(html, /data-slot="capture-preview"/);
    assert.match(html, /src="data:image\/jpeg;base64,AA=="/);
    assert.match(text(html), /Read this label/);
    assert.match(text(html), /Retake/);
    // The type row is still there, so the read's type is the person's.
    assert.match(html, /aria-label="What are you adding\?"/);
  });
});

const wine = formDefaultsFromOnboarding("WINE", {
  name: "Château Margaux",
  brandName: "Château Margaux",
  country: "France",
  wine: { vintage: "2015-01-01", style: "RED", region: "Margaux" },
});

describe("QuickAddCard", () => {
  test("name, match chip, summary, countdown and the two buttons", () => {
    const html = text(
      render(
        <QuickAddCard
          defaults={quickAddDefaultsFrom("WINE", wine)}
          itemType="WINE"
          confidence={0.93}
          onConfirm={async () => undefined}
          onEdit={noop}
        />,
      ),
    );
    assert.match(html, /Château Margaux/);
    assert.match(html, /93% match/);
    assert.match(html, /2015 · RED · Margaux · France/);
    assert.match(html, /Adding in 15s\.\.\./);
    assert.match(html, /Edit Details/);
    assert.match(html, /Add \(15s\)/);
  });
});

describe("QuickAddCard with a known item's summary", () => {
  test("the summary given replaces the one built from the read", () => {
    const html = text(
      render(
        <QuickAddCard
          defaults={quickAddDefaultsFrom("WINE", wine)}
          itemType="WINE"
          confidence={0.93}
          summary="2015 · Cabernet Sauvignon"
          onConfirm={async () => undefined}
          onEdit={noop}
        />,
      ),
    );
    assert.match(html, /2015 · Cabernet Sauvignon/);
    assert.doesNotMatch(html, /RED/);
  });
});

describe("OnboardingItemForm (the old {T}Form in create mode)", () => {
  const labels = (html: string) =>
    [...html.matchAll(/<label[^>]*>([^<]*)/g)].map((match) => match[1]);

  test("wine: old field order, Brand after Description, Barcode last, 'Add'", () => {
    const html = render(
      <OnboardingItemForm
        type="WINE"
        itemOnboardingId="o"
        defaultValues={wine}
        onCreated={noop}
      />,
    );
    assert.deepEqual(labels(html), [
      "Name",
      "Vintage",
      "Description",
      "Brand",
      "Style",
      "Variety",
      "Country",
      "Region",
      "Alcohol Content",
      "Vineyard Designation",
      "Special Designation",
      "Barcode",
    ]);
    assert.match(html, /value="Château Margaux"/);
    assert.match(html, /value="2015"/);
    assert.match(text(html), /\bAdd\b/);
  });

  test("a scanned code pre-fills the Barcode field as printed", () => {
    const html = render(
      <OnboardingItemForm
        type="BEER"
        itemOnboardingId="o"
        defaultValues={formDefaultsFromOnboarding("BEER", {})}
        sessionBarcode="081240050376"
        onCreated={noop}
      />,
    );
    assert.match(html, /value="081240050376"/);
  });
});

describe("OnboardingItemForm: the old create forms' required stars (gap #14b)", () => {
  /** Labels Joy marks required: `<label …>Vintage<span …asterisk…>`. */
  const starred = (html: string) =>
    [...html.matchAll(/<label[^>]*>([^<]*)<span[^>]*asterisk/g)].map(
      (match) => match[1],
    );

  test("sake: Name, Vintage and Category starred, as SakeForm.tsx:192,238", () => {
    const html = render(
      <OnboardingItemForm
        type="SAKE"
        itemOnboardingId="o"
        defaultValues={formDefaultsFromOnboarding("SAKE", {})}
        onCreated={noop}
      />,
    );
    assert.deepEqual(starred(html), ["Name", "Vintage", "Category"]);
  });

  test("tea: Name and Category starred, as TeaForm.tsx:236", () => {
    const html = render(
      <OnboardingItemForm
        type="TEA"
        itemOnboardingId="o"
        defaultValues={formDefaultsFromOnboarding("TEA", {})}
        onCreated={noop}
      />,
    );
    assert.deepEqual(starred(html), ["Name", "Category"]);
  });

  test("the form opts out of native validation, so N03's own messages show", () => {
    const html = render(
      <OnboardingItemForm
        type="WINE"
        itemOnboardingId="o"
        defaultValues={formDefaultsFromOnboarding("WINE", {})}
        onCreated={noop}
      />,
    );
    assert.match(html, /<input[^>]*required/);
    assert.match(html, /<form[^>]*novalidate/i);
  });
});
