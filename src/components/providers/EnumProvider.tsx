"use client";

import type { EnumKey, EnumOption } from "@cellar-assistant/shared/enums";
import { createContext, type ReactNode, useContext } from "react";

interface EnumContextValue {
  getEnumOptions<K extends EnumKey>(enumKey: K): EnumOption[] | null;
  hasServerData(enumKey: EnumKey): boolean;
}

const EnumContext = createContext<EnumContextValue | null>(null);

interface EnumProviderProps {
  children: ReactNode;
  serverEnumData: Partial<Record<EnumKey, EnumOption[]>>;
}

export function EnumProvider({ children, serverEnumData }: EnumProviderProps) {
  const contextValue: EnumContextValue = {
    getEnumOptions: (enumKey) => serverEnumData[enumKey] || null,
    hasServerData: (enumKey) => enumKey in serverEnumData,
  };

  return (
    <EnumContext.Provider value={contextValue}>{children}</EnumContext.Provider>
  );
}

export function useEnumContext() {
  const context = useContext(EnumContext);
  if (!context) {
    throw new Error("useEnumContext must be used within EnumProvider");
  }
  return context;
}
