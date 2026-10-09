/**
 * Review text (a `json` column whose shape the client owns) → the serialized
 * Lexical editor state `RichTextDisplay` / `RichTextEditor` take as `text`.
 *
 * Three shapes are in the column, and the old display only understood the
 * first (anything else threw inside Lexical's parser):
 *
 * 1. **Lexical state**, written by the old `RichTextEditor` as
 *    `JSON.stringify(editorState)` — either still a string, or already parsed
 *    into an object by the json column. Passed through.
 * 2. **`{ body: string }`**, written by the rewrite's `ItemReviews`.
 * 3. **A plain string**, which is how the rewrite reads anything else.
 *
 * Shapes 2 and 3 are wrapped in a minimal state — one paragraph per line — so
 * migrated and new rows render through the same restored component
 * (decision 6). Empty text is `null`: the caller renders nothing, as the old
 * review list did for a score-only review.
 */

type LexicalRoot = { root: { type: "root" } & Record<string, unknown> };

const isLexicalState = (value: unknown): value is LexicalRoot =>
  typeof value === "object" &&
  value !== null &&
  "root" in value &&
  typeof (value as { root: unknown }).root === "object" &&
  (value as { root: { type?: unknown } | null }).root?.type === "root";

const paragraph = (line: string) => ({
  children:
    line === ""
      ? []
      : [
          {
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            text: line,
            type: "text",
            version: 1,
          },
        ],
  direction: line === "" ? null : "ltr",
  format: "",
  indent: 0,
  type: "paragraph",
  version: 1,
  textFormat: 0,
  textStyle: "",
});

/** Plain text → a serialized Lexical state, one paragraph per line. */
export const lexicalStateFromPlainText = (text: string): string =>
  JSON.stringify({
    root: {
      children: text.split(/\r?\n/).map(paragraph),
      direction: "ltr",
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  });

/** See the module comment. Returns `null` when there is nothing to show. */
export const richTextFromReviewText = (text: unknown): string | null => {
  if (text === null || text === undefined) return null;

  if (typeof text === "string") {
    const trimmed = text.trim();
    if (trimmed === "") return null;
    if (trimmed.startsWith("{")) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (isLexicalState(parsed)) return trimmed;
        if (typeof parsed === "object" && parsed !== null && "body" in parsed) {
          return richTextFromReviewText(parsed);
        }
      } catch {
        // Not JSON after all — a review that happens to start with "{".
      }
      // JSON, but neither shape: show it as the words it is.
    }
    return lexicalStateFromPlainText(text.trim());
  }

  if (isLexicalState(text)) return JSON.stringify(text);

  if (typeof text === "object" && "body" in text) {
    const body = (text as { body: unknown }).body;
    return typeof body === "string" ? richTextFromReviewText(body) : null;
  }

  return null;
};

/**
 * The content-editable's classes, shared by `RichTextDisplay` and
 * `RichTextEditor`. Lexical renders bare `<p>`s, which Preflight strips of
 * their margins; the `[&_p]` rule gives them back the 1em the old display
 * had, so the first line sits a line's breathing room below the box's top
 * (where the editor's placeholder is drawn).
 */
export const RICH_TEXT_CONTENT =
  "type-body max-h-80 overflow-y-auto overflow-x-hidden px-4 text-ink-1 [&_p]:my-4";

type LexicalNode = { type?: unknown; text?: unknown; children?: unknown };

/** Inline nodes join their neighbours directly; anything else is a block. */
const INLINE_TYPES = new Set(["text", "link", "autolink", "hashtag"]);

/**
 * A serialized Lexical state (`richTextFromReviewText`'s output) → its words
 * on one line, blocks (paragraphs, list items, quotes) separated by a space.
 * For a one-line preview (Recent Activity), where an editor — even a
 * read-only one — would be a textbox in the accessibility tree around a
 * single clipped line. Anything unparsable is returned as it came.
 */
export const plainTextFromRichText = (state: string): string => {
  let root: unknown;
  try {
    root = (JSON.parse(state) as { root?: unknown }).root;
  } catch {
    return state;
  }
  const textOf = (node: unknown): string => {
    if (typeof node !== "object" || node === null) return "";
    const { type, text, children } = node as LexicalNode;
    if (typeof text === "string") return text;
    if (type === "linebreak") return " ";
    const inner = Array.isArray(children) ? children.map(textOf).join("") : "";
    return typeof type === "string" && INLINE_TYPES.has(type)
      ? inner
      : ` ${inner} `;
  };
  if (typeof root !== "object" || root === null) return "";
  return textOf(root).replace(/\s+/g, " ").trim();
};
