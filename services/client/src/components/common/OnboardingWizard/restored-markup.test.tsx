/**
 * Render tests for the restored onboarding wizard, asserting the **old**
 * markup and copy (`82450ad1:src/components/common/OnboardingWizard/*`,
 * `common/QuickAddCard.tsx`, `{type}/{T}Onboarding.tsx`, `{T}Form.tsx` in
 * create mode).
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
const { BarcodeStep } = await import("./BarcodeStep");
const { PictureStep } = await import("./PictureStep");
const { DisplayPictureStep } = await import("./DisplayPictureStep");
const { FinalPrompt } = await import("./FinalPrompt");
const { ExistingItems } = await import("./ExistingItems");
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

describe("ItemOnboarding (restored {T}Onboarding)", () => {
  test("opens on 'Add Wine' and the barcode step, as the old wizard did", () => {
    const html = text(render(<ItemOnboarding type="WINE" />));
    assert.match(html, /Add Wine/);
    assert.match(html, /Lets start by scanning the barcode/);
    assert.match(html, /Skip/);
  });

  test("the heading names the type", () => {
    assert.match(text(render(<ItemOnboarding type="TEA" />)), /Add Tea/);
  });
});

describe("the picture steps", () => {
  test("BarcodeStep: title, Skip and the three tips", () => {
    const html = text(
      render(
        <BarcodeStep
          barcode={undefined}
          onBarcodeChange={noop}
          onSkip={noop}
        />,
      ),
    );
    assert.match(html, /Lets start by scanning the barcode/);
    assert.match(html, /Tips/);
    assert.match(html, /Make sure the barcode is horizontal/);
    assert.match(html, /Adjust the distance so your camera is able to focus/);
  });

  test("PictureStep: header, Back/Skip, label tips", () => {
    const html = text(
      render(
        <PictureStep
          header="Lets take a picture of the front label"
          picture={undefined}
          onCapture={noop}
          onSkip={noop}
          onBack={noop}
        />,
      ),
    );
    assert.match(html, /Lets take a picture of the front label/);
    assert.match(html, /Back/);
    assert.match(html, /This picture will be used to generate the product/);
  });

  test("DisplayPictureStep", () => {
    const html = text(
      render(
        <DisplayPictureStep onCapture={noop} onSkip={noop} onBack={noop} />,
      ),
    );
    assert.match(html, /Lets take a photo that will be used for display/);
  });

  test("ExistingItems: 'Create New' and one card per match", () => {
    const html = text(
      render(
        <ExistingItems
          items={[
            {
              type: "BEER",
              item: { id: "b1", itemId: "b1", name: "Pliny the Elder" },
            },
          ]}
          onClickItem={noop}
          onSkip={noop}
        />,
      ),
    );
    assert.match(html, /Don&#x27;t see what you are looking for\?/);
    assert.match(html, /Create New/);
    assert.match(html, /Pliny the Elder/);
  });

  test("FinalPrompt", () => {
    const html = text(render(<FinalPrompt onYes={noop} onNo={noop} />));
    assert.match(html, /Would you like to add another item\?/);
    assert.match(html, /No/);
    assert.match(html, /Yes/);
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
