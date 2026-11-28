"use client";

import { type ComponentType, useEffect, useState } from "react";
import { SegmentedControl } from "../SegmentedControl";
import { PartsGallery } from "./parts";

export type KitTheme = "dark" | "light";

/**
 * Loads a gallery module from this folder by name, if it exists. A
 * template-literal import, so the bundler makes a context of `./*` and a
 * missing file is a rejected promise at run time, never a build error: the
 * kit page compiles with or without F2a's `overlays.tsx`.
 */
function loadOptional(name: string): Promise<Record<string, unknown>> {
  return import(`./${name}`);
}

/** The theme on screen now: `<html data-theme>`, else the OS's scheme. */
export function onScreenKitTheme(): KitTheme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

/** Sets `<html data-theme>` while the kit is open; puts back what was there. */
export function applyKitTheme(theme: KitTheme): () => void {
  const html = document.documentElement;
  const before = html.dataset.theme;
  html.dataset.theme = theme;
  return () => {
    if (before === undefined) delete html.dataset.theme;
    else html.dataset.theme = before;
  };
}

/**
 * The kit page's body: a Dark / Light switch that sets `<html data-theme>`,
 * every content part in its states, then the overlay gallery when there is
 * one.
 */
export function KitGallery() {
  // H-92: the switch starts from the theme on screen, not always dark.
  const [theme, setTheme] = useState<KitTheme | null>(null);
  const [Overlays, setOverlays] = useState<ComponentType | null>(null);

  useEffect(() => setTheme(onScreenKitTheme()), []);
  useEffect(() => {
    if (theme === null) return;
    return applyKitTheme(theme);
  }, [theme]);

  useEffect(() => {
    let live = true;
    loadOptional("overlays")
      .then((mod) => {
        const gallery = mod.OverlaysGallery;
        if (live && typeof gallery === "function") {
          setOverlays(() => gallery as ComponentType);
        }
      })
      .catch(() => {
        // No overlay gallery in this tree: the parts stand alone.
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div data-slot="kit-gallery" className="flex flex-col gap-8 pb-16">
      <header className="flex flex-col gap-3 pt-4">
        <h1 className="t-title m-0 text-ink">Kit</h1>
        <p className="t-cap m-0 text-ink-2">One look, every screen</p>
        <SegmentedControl
          aria-label="Theme"
          cue="detent"
          options={[
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
          ]}
          value={theme ?? "dark"}
          onValueChange={setTheme}
        />
      </header>
      <PartsGallery />
      {Overlays !== null && (
        <section aria-label="Overlays" className="flex flex-col gap-4">
          <h2 className="t-title m-0 text-ink">Overlays</h2>
          <Overlays />
        </section>
      )}
    </div>
  );
}
