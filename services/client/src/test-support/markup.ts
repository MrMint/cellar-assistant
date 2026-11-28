/**
 * Library-neutral anchors for `renderToStaticMarkup` tests.
 *
 * Markup tests here assert on what a user or assistive tech can observe —
 * copy, order, `href`, roles, `aria-*`, `data-slot` — and never on a UI
 * library's class names (Joy's `Mui…-root` and friends). A test
 * anchored on a class name breaks the moment its component moves from Joy to
 * shadcn, even when nothing a person sees has changed; one anchored on these
 * survives the move and still catches a real regression
 * (`lib/dev-checks/semantic-tests.test.ts` keeps it that way).
 */

/**
 * A loading indicator, by role: Joy's `CircularProgress` is a
 * `role="progressbar"`, shadcn's `Spinner` a `role="status"`.
 */
export const LOADING = /role="(?:progressbar|status)"/;

/**
 * The first opening tag carrying the attribute `attr` exactly (a fragment such
 * as `aria-label="Take photo"`, matched literally and as a whole attribute, so
 * `name="x"` does not match `data-name="x"`), or `""` when there is none.
 */
export const openTag = (html: string, attr: string): string =>
  new RegExp(
    `<[a-z][^>]*\\s${attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^>]*>`,
  ).exec(html)?.[0] ?? "";

/**
 * Whether an opening tag is disabled for assistive tech: a native `disabled`
 * attribute or `aria-disabled="true"`. (Joy's buttons only gain `disabled`
 * after hydration, so a component that must read as disabled in a static
 * render also sets `aria-disabled`.)
 */
export const isDisabled = (tag: string): boolean =>
  /\sdisabled(?:=""|[\s>/])|\saria-disabled="true"/.test(tag);

/** The text content of a fragment: tags dropped, whitespace collapsed. */
export const textOf = (fragment: string): string =>
  stripTags(fragment, " ").replace(/\s+/g, " ").trim();

/**
 * Drops the `<style>…</style>` blocks inlined into a static render. A scan
 * rather than a regex `replace`, so nothing a removal joins together can form a
 * new block (CodeQL "incomplete multi-character sanitization"); the markup is
 * our own render either way, never user input.
 */
export const stripStyleBlocks = (html: string): string => {
  let out = "";
  let from = 0;
  for (;;) {
    const open = html.indexOf("<style", from);
    if (open === -1) return out + html.slice(from);
    const close = html.indexOf("</style>", open);
    if (close === -1) return out + html.slice(from);
    out += html.slice(from, open);
    from = close + "</style>".length;
  }
};

/** Drops every tag, putting `replacement` where each one was (same scan). */
export const stripTags = (html: string, replacement = ""): string => {
  let out = "";
  let inTag = false;
  for (const ch of html) {
    if (inTag) {
      if (ch === ">") {
        inTag = false;
        out += replacement;
      }
    } else if (ch === "<") {
      inTag = true;
    } else {
      out += ch;
    }
  }
  return out;
};
