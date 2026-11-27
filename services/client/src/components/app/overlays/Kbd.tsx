import type { ReactElement, ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * A key, drawn as the kit's keycap (KIT § 3 Desktop: the rail's tooltip, the
 * search field's "/", the keys dialog). `keys` with spaces draws one cap per
 * key: "G C" is G then C.
 */
export function Kbd({ keys, className }: { keys: string; className?: string }) {
  const caps = keys.split(" ").filter((k) => k.length > 0);
  return (
    <span data-slot="kbd" className={cn("inline-flex gap-1", className)}>
      {caps.map((cap, i) => (
        <kbd
          // biome-ignore lint/suspicious/noArrayIndexKey: a key may repeat ("G G"); position is its identity.
          key={i}
          className="t-micro inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-edge-2 px-1 font-sans text-ink-2"
        >
          {cap}
        </kbd>
      ))}
    </span>
  );
}

/**
 * A desktop tooltip with its key (KIT § 3: "tooltip with its key after
 * 400 ms"). It only repeats a label the control already has; the trigger
 * keeps its own accessible name. Needs a `TooltipProvider` above it (the
 * rail mounts one).
 */
export function KeyTooltip({
  label,
  keys,
  side = "right",
  children,
}: {
  label: ReactNode;
  keys?: string;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} data-slot="key-tooltip">
        <span>{label}</span>
        {keys !== undefined && <Kbd keys={keys} />}
      </TooltipContent>
    </Tooltip>
  );
}
