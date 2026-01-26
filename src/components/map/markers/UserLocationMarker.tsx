"use client";

import { DivIcon } from "leaflet";
import { useMemo } from "react";
import { Marker } from "react-leaflet";
import { getMarkerColors } from "../constants/colors";

interface UserLocationMarkerProps {
  userLocation: { latitude: number; longitude: number };
  isDarkMode?: boolean;
}

/**
 * User location marker with stable positioning during zoom
 * Uses native Leaflet marker for better zoom stability
 */
export function UserLocationMarker({
  userLocation,
  isDarkMode = false,
}: UserLocationMarkerProps) {
  const colors = getMarkerColors(isDarkMode);

  const userLocationIcon = useMemo(() => {
    return new DivIcon({
      className: "user-location-marker",
      html: `
        <div style="
          position: relative;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <!-- Pulsing ring -->
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 12px;
            height: 12px;
            background-color: ${colors.border};
            border-radius: 50%;
            animation: userLocationPulse 2s infinite ease-out;
          "></div>
          
          <!-- Main dot -->
          <div style="
            position: relative;
            z-index: 2;
            width: 12px;
            height: 12px;
            background-color: ${colors.border};
            border: 2px solid ${colors.background};
            border-radius: 50%;
            box-shadow: 0 2px 6px ${colors.shadow};
          "></div>
        </div>
        
        <style>
          @keyframes userLocationPulse {
            0% {
              transform: translate(-50%, -50%) scale(0.8);
              opacity: 0.7;
            }
            50% {
              transform: translate(-50%, -50%) scale(1.2);
              opacity: 0.3;
            }
            100% {
              transform: translate(-50%, -50%) scale(1.5);
              opacity: 0;
            }
          }
          
          .user-location-marker {
            background: transparent !important;
            border: none !important;
          }
        </style>
      `,
      iconSize: [20, 20],
      iconAnchor: [10, 10], // Center anchor point
    });
  }, [colors]);

  return (
    <Marker
      position={[userLocation.latitude, userLocation.longitude]}
      icon={userLocationIcon}
      interactive={false}
    />
  );
}
