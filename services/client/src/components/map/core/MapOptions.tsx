"use client";

import { useState } from "react";
import {
  AddPlace,
  Check,
  DarkMode,
  ICON_STROKE,
  LightMode,
  More,
} from "@/components/app/icons";
import { AnchoredSheet } from "@/components/app/overlays/AnchoredSheet";
import { pressFeedback } from "@/components/app/overlays/press";
import { Button } from "@/components/ui/button";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import type { MapTheme } from "../maplibre/palette";

function OptionRow({
  icon,
  label,
  checked,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  checked?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      {...(checked === undefined
        ? { role: "menuitem" }
        : { role: "menuitemradio", "aria-checked": checked })}
      onClick={onSelect}
      {...pressFeedback()}
      className="t-body flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left text-ink outline-none transition-[background-color,transform] duration-(--ca-dur-micro) ease-standard focus-visible:outline-2 focus-visible:outline-act-ink active:scale-97 motion-reduce:active:scale-100 [@media(hover:hover)]:hover:bg-raised [&_svg]:size-5 [&_svg]:shrink-0"
    >
      <span aria-hidden className="text-ink-2">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {checked && <Check aria-hidden className="text-act-ink" />}
    </button>
  );
}

/**
 * "Map options" behind ⋯ (Map board 15): the map's own Dark map / Light map
 * (it opens in the app's theme, L23) and Add a place. A sheet on a phone, a
 * popover at the button from `md` (KIT § 4).
 */
export function MapOptions({
  theme,
  onThemeChange,
  onAddPlace,
  className,
}: {
  theme: MapTheme;
  onThemeChange: (theme: MapTheme) => void;
  onAddPlace: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const choose = (next: MapTheme) => {
    if (next !== theme) feedback("tick");
    onThemeChange(next);
    setOpen(false);
  };
  return (
    <AnchoredSheet
      open={open}
      onOpenChange={setOpen}
      title="Map"
      align="end"
      trigger={
        <Button
          variant="outline"
          aria-label="Map options"
          className={cn("size-11 shrink-0 border-edge-2 p-0", className)}
        >
          <More aria-hidden strokeWidth={ICON_STROKE} />
        </Button>
      }
    >
      <div role="menu" aria-label="Map" className="flex flex-col pb-2">
        <OptionRow
          icon={<DarkMode strokeWidth={ICON_STROKE} />}
          label="Dark map"
          checked={theme === "dark"}
          onSelect={() => choose("dark")}
        />
        <OptionRow
          icon={<LightMode strokeWidth={ICON_STROKE} />}
          label="Light map"
          checked={theme === "light"}
          onSelect={() => choose("light")}
        />
        <OptionRow
          icon={<AddPlace strokeWidth={ICON_STROKE} />}
          label="Add a place"
          onSelect={() => {
            setOpen(false);
            onAddPlace();
          }}
        />
      </div>
    </AnchoredSheet>
  );
}
