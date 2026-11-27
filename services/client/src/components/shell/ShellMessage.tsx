import type { ReactNode } from "react";
import type { ShellCopy } from "./shell-copy";

/**
 * The one layout behind every whole-page message (combined-error-01): the
 * not-found, error and offline states, the share pages' "Can't open this
 * list" and the offline page. A glyph in ink-3, the title in t-head, at most
 * one line under it in ink-2, and the one way out, an outlined button. It
 * sits near the top of the space the shell leaves, not in the middle of it,
 * so it reads the same on a phone and on a desktop column. An empty `body`
 * draws no line (an error says what happened and nothing more).
 */
export function ShellMessage({
  copy,
  icon,
  actions,
  footnote,
}: {
  copy: ShellCopy;
  icon: ReactNode;
  actions: ReactNode;
  footnote?: string | null;
}) {
  return (
    <div
      data-slot="shell-message"
      className="flex min-h-full flex-1 flex-col items-center gap-3 px-4 pt-24 pb-8 text-center"
    >
      <div
        aria-hidden
        className="text-glyph [&_svg:not([class*='size-'])]:size-6"
      >
        {icon}
      </div>
      <h1 className="t-head max-w-[420px] text-ink">{copy.title}</h1>
      {copy.body !== "" && (
        <p className="t-body max-w-[420px] text-ink-2">{copy.body}</p>
      )}
      <div className="flex flex-row gap-3 pt-1">{actions}</div>
      {footnote ? <p className="t-micro text-ink-3">{footnote}</p> : null}
    </div>
  );
}
