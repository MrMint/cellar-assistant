"use client";

import { AppBar } from "@/components/app/AppBar";
import { Pantry } from "@/components/app/icons";

/**
 * `/recipes/bar`'s AppBar. A client module of its own because an action's
 * `icon` is a component — a function — and a server page cannot pass one
 * across to `AppBar` (a client component): Next refuses the render with
 * "Functions cannot be passed directly to Client Components", and the whole
 * route falls to its error boundary. `ItemAppBar` is the same shape.
 */
export function BarAppBar() {
  return (
    <AppBar
      title="What can I make"
      parent="/recipes"
      actions={[
        { label: "Bar pantry", icon: Pantry, href: "/recipes/bar/pantry" },
      ]}
    />
  );
}
