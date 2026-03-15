"use client";

import { useActor, useSelector } from "@xstate/react";
import { createContext, type ReactNode, useContext } from "react";
// XState DevTools Integration
// Note: Inspector types between @statelyai/inspect and xstate may not perfectly align,
// but the runtime behavior is correct.
import type { ActorRefFrom, InspectionEvent, Observer } from "xstate";
import { MAP_CONFIG } from "../config/constants";
import { mapMachine } from "../state/mapMachine";

let inspectorObserver: Observer<InspectionEvent> | undefined;
let inspectorAvailable = false;

if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  // Dynamically import inspector to avoid SSR issues
  import("@statelyai/inspect").then(({ createBrowserInspector }) => {
    const browserInspector = createBrowserInspector({
      // Auto-open inspector in development
      autoStart: false, // Set to true to auto-open
    });
    inspectorObserver = browserInspector.inspect;
    inspectorAvailable = true;
  });
}

// Create the context
type MapMachineContextType = ActorRefFrom<typeof mapMachine> | null;
const MapMachineContext = createContext<MapMachineContextType>(null);

interface MapMachineProviderProps {
  children: ReactNode;
  userId: string;
}

/**
 * Provider that creates and shares a single map machine instance
 * across all child components. This ensures state consistency
 * and prevents multiple machine instances.
 */
export function MapMachineProvider({
  children,
  userId,
}: MapMachineProviderProps) {
  const [, , actorRef] = useActor(mapMachine, {
    input: { userId },
    inspect: inspectorObserver, // Connect to XState inspector in development
  });

  return (
    <MapMachineContext.Provider value={actorRef}>
      {children}

      {/* Development-only inspector toggle */}
      {process.env.NODE_ENV === "development" && (
        <button
          type="button"
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            zIndex: MAP_CONFIG.Z_INDEX.OVERLAY,
            backgroundColor: "#1976d2",
            color: "white",
            padding: "8px 12px",
            borderRadius: "4px",
            border: "none",
            fontSize: "12px",
            cursor: "pointer",
            fontFamily: "monospace",
          }}
          onClick={() => {
            if (inspectorAvailable) {
              // Toggle inspector
              window.open("https://stately.ai/inspect", "_blank");
            }
          }}
          title="Open XState Inspector (Development Only)"
        >
          XState Inspector
        </button>
      )}
    </MapMachineContext.Provider>
  );
}

/**
 * Hook to access the map machine actor reference
 * Throws an error if used outside of MapMachineProvider
 */
export function useMapMachineActor(): ActorRefFrom<typeof mapMachine> {
  const actorRef = useContext(MapMachineContext);

  if (!actorRef) {
    throw new Error(
      "useMapMachineActor must be used within a MapMachineProvider",
    );
  }

  return actorRef;
}

/**
 * Hook to access state and send function from the shared machine
 */
export function useMapMachineFromContext() {
  const actorRef = useMapMachineActor();
  const state = useSelector(actorRef, (state) => state);
  const send = actorRef.send;

  return [state, send] as const;
}
