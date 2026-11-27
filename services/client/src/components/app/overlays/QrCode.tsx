import { encode } from "uqr";
import { cn } from "@/lib/utils";

/** The matrix for `value`: real QR encoding (L14), medium error correction. */
export function qrMatrix(value: string): boolean[][] {
  return encode(value, { ecc: "M", border: 0 }).data;
}

/**
 * The dark modules as one SVG path, one unit square per module, so the
 * code scales crisply at any size (`shape-rendering: crispEdges`).
 */
export function qrPath(matrix: readonly (readonly boolean[])[]): string {
  let d = "";
  matrix.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) d += `M${x} ${y}h1v1h-1z`;
    });
  });
  return d;
}

/**
 * A QR code on the kit's white plate (kit-10): black modules on white in
 * both themes — a code a phone camera reads needs that contrast whatever
 * the app's theme — r16, with the quiet zone as the plate's padding.
 * `label` is its accessible name ("QR code for this list").
 */
export function QrCode({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const matrix = qrMatrix(value);
  const size = matrix.length;
  return (
    <div
      data-slot="qr-plate"
      className={cn("rounded-lg bg-white p-6 text-black", className)}
    >
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${size} ${size}`}
        className="block size-full"
        shapeRendering="crispEdges"
      >
        <path d={qrPath(matrix)} fill="currentColor" />
      </svg>
    </div>
  );
}
