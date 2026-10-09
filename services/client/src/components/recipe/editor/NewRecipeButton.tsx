"use client";

import { useState } from "react";
import { Add } from "@/components/app/icons";
import { Button } from "@/components/ui/button";
import { isOffered, useAiCapabilities } from "@/lib/ai/capabilities";
import { NewRecipeSheet } from "./NewRecipeSheet";

/**
 * The Bar page's ＋ (X15): "New recipe", opening Photo · Paste · Type. The
 * same place the old orphaned generator never had a door to.
 */
export function NewRecipeButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const aiOffered = isOffered(useAiCapabilities(), "recipePhoto");
  return (
    <>
      <Button className={className} onClick={() => setOpen(true)}>
        <Add aria-hidden />
        New recipe
      </Button>
      <NewRecipeSheet
        open={open}
        onOpenChange={setOpen}
        aiOffered={aiOffered}
      />
    </>
  );
}
