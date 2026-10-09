import { redirect } from "next/navigation";

/**
 * `/discoveries` — retired by X10 (D1: "Scans and Discoveries → Home inbox
 * plus the Map sheet"). Its Pending Matches are Home's "Waiting on you"
 * rows, one per scan, each into that scan's results; so an old link lands
 * there.
 */
export default function DiscoveriesPage(): never {
  redirect("/#waiting");
}
