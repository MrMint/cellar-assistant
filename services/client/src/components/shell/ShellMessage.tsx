import type { ReactNode } from "react";
import type { ShellCopy } from "./shell-copy";

/**
 * The one layout behind the shell's not-found, error and offline states: an
 * icon, a heading, a sentence and the actions, centred in whatever space the
 * shell leaves. The copy and the behaviour around it live in `shell-copy.ts`.
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
      className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 px-4 py-8 text-center"
    >
      <div
        aria-hidden
        className="text-ink-3 [&_svg:not([class*='size-'])]:size-12"
      >
        {icon}
      </div>
      <h1 className="t-title max-w-[420px] text-ink">{copy.title}</h1>
      <p className="t-body max-w-[420px] text-ink-2">{copy.body}</p>
      <div className="flex flex-row gap-3 pt-2">{actions}</div>
      {footnote ? <p className="t-cap">{footnote}</p> : null}
    </div>
  );
}
