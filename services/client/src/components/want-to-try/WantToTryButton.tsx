"use client";

import type { MouseEvent } from "react";
import { IconButton } from "@/components/app/IconButton";
import { ICON_STROKE, WantToTry } from "@/components/app/icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { WantToTryTarget } from "./adapter";
import { useWantToTry } from "./useWantToTry";

export type WantToTryButtonProps = {
  target: WantToTryTarget;
  /** The server's state: `isWantToTry`, or a place's `wantToVisit`. */
  saved: boolean;
  /** Named in the toast and in the icon variant's accessible name. */
  name?: string;
  /**
   * `icon` — a 44 pt bookmark (item and recipe headers, list rows, activity
   * rows); `button` — the bookmark and the words, for an action row (the
   * place drawer) where every action is labelled.
   */
  variant?: "icon" | "button";
  /** `sm` draws the icon variant at 36 pt inside its 44 pt target. */
  size?: "default" | "sm";
  /**
   * The icon variant on a filled tile (outline when off, secondary when on),
   * to sit in a row of framed icon buttons like the place drawer's.
   */
  framed?: boolean;
  className?: string;
  onChange?: (saved: boolean) => void;
};

/**
 * The Save target of D27's Save · Log · Rate · Love: "Want to try", as a
 * bookmark. Off it is an outline; on it is filled in ink — not brass (brass
 * is for actions) and not claret (that is Love's heart). `aria-pressed`
 * carries the state, so the name stays "Want to try" either way.
 *
 * Stops the click from reaching a card or row it sits in, so it can live
 * beside a stretched link.
 */
export function WantToTryButton({
  target,
  saved: initial,
  name,
  variant = "icon",
  size = "default",
  framed = false,
  className,
  onChange,
}: WantToTryButtonProps) {
  const { saved, pending, toggle } = useWantToTry({
    target,
    initial,
    name,
    onChange,
  });

  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void toggle();
  };

  const glyph = pending ? (
    <Spinner />
  ) : (
    <WantToTry
      aria-hidden
      strokeWidth={ICON_STROKE}
      className={cn(saved ? "fill-current text-ink-1" : "text-ink-2")}
    />
  );

  if (variant === "button") {
    return (
      <Button
        type="button"
        variant={saved ? "secondary" : "outline"}
        onClick={onClick}
        disabled={pending}
        aria-pressed={saved}
        aria-busy={pending || undefined}
        className={className}
      >
        {glyph}
        Want to try
      </Button>
    );
  }

  return (
    <IconButton
      aria-label={name ? `Want to try ${name}` : "Want to try"}
      aria-pressed={saved}
      aria-busy={pending || undefined}
      disabled={pending}
      onClick={onClick}
      size={size}
      variant={framed ? (saved ? "secondary" : "outline") : "ghost"}
      className={cn("relative z-10", className)}
    >
      {glyph}
    </IconButton>
  );
}
