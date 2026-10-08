/**
 * Library-neutral anchors for `renderToStaticMarkup` tests.
 *
 * Markup tests here assert on what a user or assistive tech can observe —
 * copy, order, `href`, roles, `aria-*`, `data-slot` — and never on a UI
 * library's class names (`MuiCard-root`, `MuiTypography-title-lg`, …). A test
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
 * The first opening tag matching `attr` (a fragment such as
 * `aria-label="Take photo"`), or `""` when there is none.
 */
export const openTag = (html: string, attr: string): string =>
  new RegExp(`<[a-z][^>]*${attr}[^>]*>`).exec(html)?.[0] ?? "";

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
  fragment
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
