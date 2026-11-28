import type { Metadata } from "next";
import { TasteProfileView } from "@/components/taste/TasteProfileView";

export const metadata: Metadata = { title: "Taste profile" };

/**
 * `/taste-profile` — Me › Lists › Taste profile (L03): your archetype from
 * your own ratings, and where you and each friend agree. Client-fetched:
 * every number on it is computed by `TasteActor` per request.
 */
export const dynamic = "force-dynamic";

export default function TasteProfilePage() {
  return <TasteProfileView />;
}
