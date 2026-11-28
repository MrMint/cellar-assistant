"use client";

interface CenterPinOverlayProps {
  /**
   * The map's padding while the Add a place sheet is up (FS-1): the pin
   * stands at the middle of the box the sheet leaves, where MapLibre's
   * padded centre is.
   */
  padding: { top: number; bottom: number; left: number; right: number };
}

/**
 * Uber-style center pin for placing a new location. The pin is
 * CSS-positioned at the map's (padded) centre — the person pans and zooms
 * the map underneath it; the Add a place sheet beside it holds the form.
 */
export function CenterPinOverlay({ padding }: CenterPinOverlayProps) {
  return (
    <div
      data-slot="center-pin"
      className="pointer-events-none absolute z-[12]"
      style={{
        top: padding.top,
        bottom: padding.bottom,
        left: padding.left,
        right: padding.right,
      }}
    >
      {/* Pin at the visual centre of the map's open box */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full drop-shadow-md">
        <svg
          width="40"
          height="52"
          viewBox="0 0 40 52"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title>Location pin for placing a new place on the map</title>
          {/* Pin body */}
          <path
            d="M20 0C8.954 0 0 8.954 0 20c0 14 20 32 20 32s20-18 20-32C40 8.954 31.046 0 20 0z"
            className="fill-primary"
          />
          {/* Inner circle */}
          <circle cx="20" cy="20" r="8" className="fill-primary-foreground" />
        </svg>
      </div>

      {/* Shadow dot at pin base for depth */}
      <div className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-scrim" />
    </div>
  );
}
