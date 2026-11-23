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
 * Repeats `pass` until the markup stops changing, so a removal that joins two
 * halves of a tag cannot leave a new one behind (CodeQL "incomplete
 * multi-character sanitization"). The markup is our own render, not user input.
 */
const untilStable = (html: string, pass: (s: string) => string): string => {
  let previous: string;
  let current = html;
  do {
    previous = current;
    current = pass(previous);
  } while (current !== previous);
  return current;
};

/** Drops the `<style>` blocks inlined into a static render. */
export const stripStyleBlocks = (html: string): string =>
  untilStable(html, (s) => s.replace(/<style[^>]*>[^<]*<\/style>/g, ""));

/** Drops every tag, putting `replacement` where each one was. */
export const stripTags = (html: string, replacement = ""): string =>
  untilStable(html, (s) => s.replace(/<[^>]+>/g, replacement));
