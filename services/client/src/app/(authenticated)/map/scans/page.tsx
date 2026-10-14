import { redirect } from "next/navigation";

/**
 * `/map/scans` (the list) — retired by X10 (D1: "Scans and Discoveries →
 * Home inbox plus the Map sheet"). A scan that is reading, read or waiting
 * on matches is on Home (the job tray and "Waiting on you"); each scan's own
 * page, `/map/scans/[scanId]`, stays. An old link lands on Home's inbox.
 */
export default function ScanHistoryPage(): never {
  redirect("/#waiting");
}
