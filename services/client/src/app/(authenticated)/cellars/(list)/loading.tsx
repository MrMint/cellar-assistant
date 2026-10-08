import { CellarsShell } from "@/components/cellar/CellarsShell";

/**
 * The Cellar tab's shell (X24). In the `(list)` group so it wraps `/cellars`
 * alone: at `cellars/` it would also stand in for every cellar's own pages
 * (a cellar list while a cellar's items load), which have shells of their
 * own.
 */
export default function CellarsLoading() {
  return <CellarsShell />;
}
