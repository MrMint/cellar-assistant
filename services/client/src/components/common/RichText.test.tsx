/**
 * The restored Lexical `RichTextDisplay` / `RichTextEditor` and the reader
 * that feeds them.
 *
 * Lexical parses `editorState` while the composer renders, so a server render
 * is enough to prove the point that matters: every shape in the review column
 * reaches the component as a state it accepts, where the raw value would have
 * thrown. (Lexical fills the content-editable from an effect, so the text
 * itself is not in server markup; the structure is.)
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RichTextDisplay } from "./RichTextDisplay";
import { RichTextEditor } from "./RichTextEditor";
import {
  lexicalStateFromPlainText,
  plainTextFromRichText,
  richTextFromReviewText,
} from "./rich-text";

const render = (node: ReactNode) =>
  renderToStaticMarkup(node).replace(/<style[^>]*>[^<]*<\/style>/g, "");

const oldLexical = lexicalStateFromPlainText("Bright cherry.\nLong finish.");

describe("richTextFromReviewText", () => {
  test("old Lexical state, as a string, passes through untouched", () => {
    assert.equal(richTextFromReviewText(oldLexical), oldLexical);
  });

  test("old Lexical state, parsed into an object by the json column", () => {
    assert.deepEqual(
      JSON.parse(richTextFromReviewText(JSON.parse(oldLexical)) ?? "null"),
      JSON.parse(oldLexical),
    );
  });

  test("the rewrite's { body } and plain strings become one paragraph per line", () => {
    const fromBody = JSON.parse(
      richTextFromReviewText({ body: "Nice\nvery nice" }) ?? "null",
    );
    assert.equal(fromBody.root.type, "root");
    assert.deepEqual(
      fromBody.root.children.map(
        (p: { children: { text: string }[] }) => p.children[0]?.text,
      ),
      ["Nice", "very nice"],
    );
    assert.equal(
      richTextFromReviewText("Nice\nvery nice"),
      richTextFromReviewText({ body: "Nice\nvery nice" }),
    );
    assert.equal(
      richTextFromReviewText('{"body":"Nice"}'),
      richTextFromReviewText("Nice"),
      "a stringified { body } is unwrapped too",
    );
  });

  test("text that merely looks like JSON is shown as text", () => {
    const state = JSON.parse(richTextFromReviewText("{not json") ?? "null");
    assert.equal(state.root.children[0].children[0].text, "{not json");
    const other = JSON.parse(richTextFromReviewText('{"a":1}') ?? "null");
    assert.equal(other.root.children[0].children[0].text, '{"a":1}');
  });

  test("nothing to show is null", () => {
    for (const empty of [
      null,
      undefined,
      "",
      "   ",
      { body: "" },
      { body: 3 },
      42,
    ]) {
      assert.equal(richTextFromReviewText(empty), null, JSON.stringify(empty));
    }
  });
});

describe("RichTextDisplay (restored)", () => {
  test("a read-only content-editable inside the composer", () => {
    const html = render(<RichTextDisplay text={oldLexical} />);
    assert.match(html, /contentEditable="false"/);
  });

  test("X21: an article, not an unnamed read-only textbox", () => {
    const html = render(<RichTextDisplay text={oldLexical} />);
    assert.match(html, /role="article"/);
    assert.doesNotMatch(html, /role="textbox"/);
    assert.doesNotMatch(html, /aria-readonly/);
    assert.doesNotMatch(html, /aria-autocomplete/);
  });

  test("every column shape renders once adapted; a raw { body } would not", () => {
    for (const raw of [
      oldLexical,
      { body: "x" },
      "plain",
      JSON.parse(oldLexical),
    ]) {
      const text = richTextFromReviewText(raw);
      assert.ok(text);
      assert.doesNotThrow(() => render(<RichTextDisplay text={text} />));
    }
    assert.throws(() => render(<RichTextDisplay text='{"body":"x"}' />));
  });
});

describe("plainTextFromRichText", () => {
  test("a state's blocks on one line, empty paragraphs dropped", () => {
    const state = lexicalStateFromPlainText("Bright cherry\n\nlong finish");
    assert.equal(plainTextFromRichText(state), "Bright cherry long finish");
  });

  test("runs inside a block join as written; blocks and list items get a space", () => {
    const state = JSON.stringify({
      root: {
        type: "root",
        children: [
          {
            type: "paragraph",
            children: [
              { type: "text", text: "Very " },
              { type: "text", text: "good", format: 1 },
            ],
          },
          {
            type: "list",
            children: [
              { type: "listitem", children: [{ type: "text", text: "a" }] },
              { type: "listitem", children: [{ type: "text", text: "b" }] },
            ],
          },
        ],
      },
    });
    assert.equal(plainTextFromRichText(state), "Very good a b");
  });

  test("the old editor's state and every adapted shape read as words", () => {
    for (const raw of [{ body: "lovely" }, "lovely", oldLexical]) {
      const text = richTextFromReviewText(raw);
      assert.ok(text);
      assert.notEqual(plainTextFromRichText(text), "");
      assert.doesNotMatch(plainTextFromRichText(text), /[{}]/);
    }
  });

  test("anything unparsable comes back as it was", () => {
    assert.equal(plainTextFromRichText("not json"), "not json");
    assert.equal(plainTextFromRichText('{"nope":1}'), "");
  });
});

describe("RichTextEditor (restored)", () => {
  test("a framed, editable, empty textbox and the placeholder", () => {
    const html = render(
      <RichTextEditor onChange={() => {}} placeholder="Tell us more" />,
    );
    assert.match(html, /^<div\b[^>]*><div[^>]*role="textbox"[^>]*><\/div>/);
    assert.match(html, /contentEditable="true"/);
    assert.match(html, />Tell us more</);
  });

  test("readonly turns editing off", () => {
    const html = render(
      <RichTextEditor onChange={() => {}} readonly value={oldLexical} />,
    );
    assert.match(html, /contentEditable="false"/);
  });
});
