import { AddTierListClient } from "@/components/tier-list/AddTierListClient";

/**
 * `/tier-lists/add` — the old `AddTierListClient` (`82450ad1`). The old page
 * pre-fetched the `permission` enum into an `EnumProvider`; privacy is the
 * SDL's `PermissionType`, which `EnumSelect` knows at compile time.
 */
export default function AddTierListPage() {
  return <AddTierListClient />;
}
