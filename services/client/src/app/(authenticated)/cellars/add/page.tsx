import { AddCellarClient } from "@/components/cellar/AddCellarClient";

/**
 * `/cellars/add` — the old `AddCellarClient` (`82450ad1`).
 *
 * The old page pre-fetched the `permission` enum into an `EnumProvider`;
 * privacy is now the SDL's `PermissionType`, whose three values `EnumSelect`
 * knows at compile time (`hooks/enum-options.ts`), so there is nothing to
 * fetch here and the viewer is implicit in `myFriends`.
 */
export default function AddCellar() {
  return <AddCellarClient />;
}
