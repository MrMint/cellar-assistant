/**
 * The list share sheet's body (Social-Lists 11-14): who can open the link,
 * the preview card or the code, and the rows. The privacy strip is the one
 * write here, and only the list's maker is offered it.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { stripStyleBlocks, textOf } from "@/test-support/markup";
import { ListShareBody, type ListSharePreview } from "./ListShareSheet";

const preview: ListSharePreview = {
  listType: "place",
  itemCount: 6,
  ownerName: "Test",
  photoUrl: "https://files.example/kiln.jpg",
  top: [
    { id: "a", name: "Kettle & Kiln Coffee", band: 5 },
    { id: "b", name: "Lakeside Tap House", band: 5 },
    { id: "c", name: "Copper Still Cocktail Room", band: 4 },
  ],
};

const render = (props: Partial<Parameters<typeof ListShareBody>[0]>) =>
  stripStyleBlocks(
    renderToStaticMarkup(
      <ListShareBody
        name="Madison drinking spots"
        url="https://cellar.example/tier-lists/tl-1"
        privacy="PUBLIC"
        canEdit={false}
        onPrivacyChange={() => {}}
        preview={preview}
        {...props}
      />,
    ),
  );

describe("ListShareBody", () => {
  test("the preview card: kind, name, owner · count, top three, photo", () => {
    const html = render({});
    const text = textOf(html);
    assert.match(text, /Ranked places/);
    assert.match(text, /Madison drinking spots/);
    assert.match(text, /by Test · 6 places/);
    assert.match(text, /#1 Kettle (&amp;|&) Kiln Coffee/);
    assert.match(text, /#3 Copper Still Cocktail Room/);
    assert.match(html, /src="https:\/\/files\.example\/kiln\.jpg"/);
    assert.match(text, /Copy link/);
    assert.match(text, /Show code/);
  });

  test("the maker is offered who can see it", () => {
    const html = render({ canEdit: true, privacy: "FRIENDS" });
    assert.match(html, /aria-label="Who can see it"/);
    for (const option of ["Only me", "Friends", "Everyone"]) {
      assert.match(html, new RegExp(`>${option}<`));
    }
  });

  test("anyone else is never offered the privacy write", () => {
    const html = render({ canEdit: false, privacy: "FRIENDS" });
    assert.doesNotMatch(html, /Who can see it/);
    assert.doesNotMatch(html, />Only me</);
  });
});
