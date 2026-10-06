import { AddItemClient } from "@/components/cellar/AddItemClient";

/**
 * `/add` — the old `AddItemClient` (six image cards), with no cellar: each
 * card opens that type's onboarding wizard (`/add/{type}s`).
 */
export const dynamic = "force-dynamic";

export default function AddPage() {
  return <AddItemClient canAdd />;
}
