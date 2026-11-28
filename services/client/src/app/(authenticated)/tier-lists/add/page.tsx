import type { Metadata } from "next";
import { AppBar } from "@/components/app/AppBar";
import { AddTierListClient } from "@/components/tier-list/AddTierListClient";

export const metadata: Metadata = { title: "New list" };

/**
 * `/tier-lists/add` — the old `AddTierListClient` (`82450ad1`). The old page
 * pre-fetched the `permission` enum into an `EnumProvider`; privacy is the
 * SDL's `PermissionType`, which `EnumSelect` knows at compile time.
 */
export default function AddTierListPage() {
  // X21: the page's h1, and a way back on a cold open.
  return (
    <div className="flex max-w-[600px] flex-col gap-4">
      <AppBar title="New list" parent="/tier-lists" />
      <AddTierListClient />
    </div>
  );
}
