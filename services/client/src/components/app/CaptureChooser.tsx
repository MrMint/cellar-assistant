"use client";

import { BottomSheet } from "./BottomSheet";
import { ChevronRight } from "./icons";
import { Link } from "./Link";
import { CAPTURE_OPTIONS, type CaptureOption } from "./nav";

export type CaptureChooserProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options?: readonly CaptureOption[];
};

/**
 * What the brass ＋ opens (X01): Bottle · Menu · Recipe · Place, each a row
 * leading into today's flow. One capture entry now; X06 replaces the sheet
 * with the full-screen capture surface behind the same button.
 */
export function CaptureChooser({
  open,
  onOpenChange,
  options = CAPTURE_OPTIONS,
}: CaptureChooserProps) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Add">
      <ul className="flex flex-col pb-2">
        {options.map(({ key, label, description, href, icon: Icon }) => (
          <li key={key} className="relative">
            <div className="flex min-h-14 items-center gap-3 rounded-md px-2 py-2 active:bg-surface-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-3 text-ink-1">
                <Icon aria-hidden className="size-5" strokeWidth={1.75} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <Link
                  href={href}
                  overlay
                  underline="none"
                  className="type-headline text-ink-1"
                  onClick={() => onOpenChange(false)}
                >
                  {label}
                </Link>
                <span className="type-footnote">{description}</span>
              </span>
              <ChevronRight
                aria-hidden
                className="size-5 text-ink-3"
                strokeWidth={1.75}
              />
            </div>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
