/**
 * CSS-based label collision reduction and styling improvements
 * Provides utility functions to inject label styling that reduces visual overlap
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Utility class pattern for CSS injection
export class LabelStyling {
  private static stylesInjected = false;

  /**
   * Inject CSS styles for improved label positioning and collision reduction
   */
  static injectLabelStyles(): void {
    if (LabelStyling.stylesInjected || typeof document === "undefined") return;

    const styleElement = document.createElement("style");
    styleElement.id = "poi-label-styles";
    styleElement.textContent = `
      /* Enhanced POI label styles for collision reduction */
      .enhanced-poi-marker {
        z-index: 1000;
      }

      .enhanced-poi-marker .poi-label {
        /* Ensure labels don't interfere with interactions */
        pointer-events: none;
        user-select: none;
        
        /* Improve readability */
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
        
        /* Subtle animations for better UX */
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      /* Hover effects for parent marker */
      .enhanced-poi-marker:hover .poi-label {
        opacity: 1 !important;
        background: rgba(255, 255, 255, 0.98) !important;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2) !important;
        transform: var(--label-transform, translateX(-50%)) scale(1.05);
      }

      /* Staggered animations based on position */
      .enhanced-poi-marker .poi-label:nth-of-type(1) { animation-delay: 0ms; }
      .enhanced-poi-marker .poi-label:nth-of-type(2) { animation-delay: 50ms; }
      .enhanced-poi-marker .poi-label:nth-of-type(3) { animation-delay: 100ms; }
      .enhanced-poi-marker .poi-label:nth-of-type(4) { animation-delay: 150ms; }

      /* Distance-based label hiding for clutter reduction */
      @media screen and (max-width: 768px) {
        /* On smaller screens, be more aggressive about hiding labels */
        .leaflet-zoom-anim .enhanced-poi-marker .poi-label {
          opacity: 0;
          transition: opacity 0.1s ease;
        }
      }

      /* Zoom level responsive design */
      .leaflet-container[data-zoom="10"] .enhanced-poi-marker .poi-label,
      .leaflet-container[data-zoom="11"] .enhanced-poi-marker .poi-label {
        font-size: 8px !important;
        padding: 1px 3px !important;
      }

      .leaflet-container[data-zoom="12"] .enhanced-poi-marker .poi-label,
      .leaflet-container[data-zoom="13"] .enhanced-poi-marker .poi-label {
        font-size: 9px !important;
        padding: 1px 4px !important;
      }

      /* High zoom levels get full labels */
      .leaflet-container[data-zoom="14"] .enhanced-poi-marker .poi-label,
      .leaflet-container[data-zoom="15"] .enhanced-poi-marker .poi-label,
      .leaflet-container[data-zoom="16"] .enhanced-poi-marker .poi-label,
      .leaflet-container[data-zoom="17"] .enhanced-poi-marker .poi-label,
      .leaflet-container[data-zoom="18"] .enhanced-poi-marker .poi-label {
        font-size: 10px !important;
        padding: 2px 6px !important;
      }

      /* Custom positioning CSS variables for different label positions */
      .enhanced-poi-marker .poi-label[style*="translateX(-50%)"] {
        --label-transform: translateX(-50%);
      }
      
      .enhanced-poi-marker .poi-label[style*="translateY(-50%)"] {
        --label-transform: translateY(-50%);
      }

      /* Collision-aware opacity adjustment */
      .enhanced-poi-marker:not(:hover) .poi-label {
        opacity: 0.85;
      }

      /* Dense area label management */
      .leaflet-marker-pane .enhanced-poi-marker:nth-child(4n+1) .poi-label {
        z-index: 1004;
      }
      .leaflet-marker-pane .enhanced-poi-marker:nth-child(4n+2) .poi-label {
        z-index: 1003;
      }
      .leaflet-marker-pane .enhanced-poi-marker:nth-child(4n+3) .poi-label {
        z-index: 1002;
      }
      .leaflet-marker-pane .enhanced-poi-marker:nth-child(4n+4) .poi-label {
        z-index: 1001;
      }

      /* Animation for label appearance */
      @keyframes labelFadeIn {
        from { 
          opacity: 0; 
          transform: var(--label-transform, translateX(-50%)) translateY(5px) scale(0.9);
        }
        to { 
          opacity: 0.85; 
          transform: var(--label-transform, translateX(-50%)) translateY(0) scale(1);
        }
      }

      .enhanced-poi-marker .poi-label {
        animation: labelFadeIn 0.4s ease-out;
      }
    `;

    document.head.appendChild(styleElement);
    LabelStyling.stylesInjected = true;
  }

  /**
   * Update zoom level attribute for responsive label sizing
   */
  static updateZoomLevel(mapContainer: HTMLElement, zoomLevel: number): void {
    if (mapContainer) {
      mapContainer.setAttribute("data-zoom", zoomLevel.toString());
    }
  }

  /**
   * Remove injected styles (for cleanup)
   */
  static removeStyles(): void {
    const existingStyles = document.getElementById("poi-label-styles");
    if (existingStyles) {
      existingStyles.remove();
    }
    LabelStyling.stylesInjected = false;
  }
}
