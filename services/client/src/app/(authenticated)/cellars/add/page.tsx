import type { Metadata } from "next";
import { AppBar } from "@/components/app/AppBar";
import { AddCellarClient } from "@/components/cellar/AddCellarClient";

export const metadata: Metadata = { title: "New cellar" };

/**
 * `/cellars/add` — the old `AddCellarClient` (`82450ad1`).
 *
 * The old page pre-fetched the `permission` enum into an `EnumProvider`;
 * privacy is now the SDL's `PermissionType`, whose three values `EnumSelect`
 * knows at compile time (`hooks/enum-options.ts`), so there is nothing to
 * fetch here and the viewer is implicit in `myFriends`.
 */
export default function AddCellar() {
  // X21: the page's h1, and a way back on a cold open.
  return (
    <div className="flex flex-col gap-4">
      <AppBar title="New cellar" parent="/cellars" />
      <AddCellarClient />
    </div>
  );
}
