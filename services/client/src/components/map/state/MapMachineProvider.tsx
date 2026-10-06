"use client";

import { useActor, useSelector } from "@xstate/react";
import { createContext, type ReactNode, useContext } from "react";
import { useClient } from "urql";
import type { ActorRefFrom } from "xstate";
import { mapMachine } from "../state/mapMachine";

/**
 * `82450ad1:src/components/map/state/MapMachineProvider.tsx`, restored.
 *
 * One change: the machine's input carries the page's URQL client, because
 * its fetch service is no longer a server action (`../actions.ts`). The
 * development-only XState inspector hook-up (`@statelyai/inspect` and its
 * floating button) is not restored — it never rendered in production, and
 * the package is not a dependency any more.
 */

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
  const client = useClient();
  const [, , actorRef] = useActor(mapMachine, {
    input: { userId, client },
  });

  return (
    <MapMachineContext.Provider value={actorRef}>
      {children}
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
