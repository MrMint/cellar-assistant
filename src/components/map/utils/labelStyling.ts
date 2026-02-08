/**
 * Zoom-responsive label sizing via CSS custom properties.
 * The static CSS file (src/styles/poi-labels.css) references custom properties,
 * and this class updates those properties on the map container when zoom changes.
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Utility class pattern for CSS property management
export class LabelStyling {
  private static readonly ZOOM_STYLES: Record<
    number,
    { fontSize: string; padding: string }
  > = {
    10: { fontSize: "8px", padding: "1px 3px" },
    11: { fontSize: "8px", padding: "1px 3px" },
    12: { fontSize: "9px", padding: "1px 4px" },
    13: { fontSize: "9px", padding: "1px 4px" },
    14: { fontSize: "10px", padding: "2px 6px" },
    15: { fontSize: "10px", padding: "2px 6px" },
    16: { fontSize: "10px", padding: "2px 6px" },
    17: { fontSize: "10px", padding: "2px 6px" },
    18: { fontSize: "10px", padding: "2px 6px" },
  };

  private static readonly DEFAULT_STYLE = {
    fontSize: "10px",
    padding: "2px 6px",
  };

  /**
   * No-op: styles are now in a static CSS file imported at the layout level.
   * Kept for backward compatibility with POILayer's useEffect calls.
   */
  static injectLabelStyles(): void {
    // Static CSS imported at app level — nothing to inject
  }

  /**
   * Update CSS custom properties on the map container for zoom-responsive sizing.
   */
  static updateZoomLevel(mapContainer: HTMLElement, zoomLevel: number): void {
    const style =
      LabelStyling.ZOOM_STYLES[zoomLevel] ?? LabelStyling.DEFAULT_STYLE;
    mapContainer.style.setProperty("--poi-label-font-size", style.fontSize);
    mapContainer.style.setProperty("--poi-label-padding", style.padding);
  }

  /**
   * No-op: no injected styles to remove.
   * Kept for backward compatibility with POILayer's useEffect cleanup.
   */
  static removeStyles(): void {
    // Static CSS — nothing to remove
  }
}
