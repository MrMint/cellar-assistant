"use client";

import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { feedback } from "@/lib/feedback";

export type JumpLetter = { letter: string; count: number; target: string };

/**
 * Jump to a letter (combined-03, -15): a grid of the letters present, each
 * with how many it holds; a tap closes the sheet and scrolls to the first.
 * Letters with nothing are not drawn. By maker it jumps between makers.
 */
export function JumpSheet({
  open,
  onOpenChange,
  letters,
  title,
  onJump,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  letters: readonly JumpLetter[];
  title: string;
  onJump: (target: string) => void;
}) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={title}>
      <div
        data-slot="cellar-jump"
        className="grid grid-cols-6 gap-2.5 pb-2 md:grid-cols-7"
      >
        {letters.map((entry) => (
          <button
            key={entry.letter}
            type="button"
            aria-label={`${entry.letter}, ${entry.count}`}
            onClick={() => {
              feedback("tick");
              onOpenChange(false);
              onJump(entry.target);
            }}
            className="flex h-[52px] min-w-11 flex-col items-center justify-center rounded-md border border-edge text-ink outline-none transition-[background-color,transform] duration-(--ca-dur-micro) ease-standard focus-visible:outline-2 focus-visible:outline-act-ink active:scale-97 motion-reduce:active:scale-100 [@media(hover:hover)]:hover:bg-raised"
          >
            <span className="t-head">{entry.letter}</span>
            <span className="t-micro tabular text-ink-2">{entry.count}</span>
          </button>
        ))}
      </div>
    </ResponsiveDialog>
  );
}
