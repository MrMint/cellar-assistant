"use client";

import { useCallback, useState } from "react";
import {
  processRecipePhotoAction,
  type RecipeProcessingResult,
} from "@/app/actions/processRecipePhoto";

// Re-export RecipeProcessingResult for consumers
export type { RecipeProcessingResult } from "@/app/actions/processRecipePhoto";

export interface RecipePhotoProcessingOptions {
  file: File;
  placeId?: string;
  menuItemId?: string;
}

export interface RecipePhotoProcessingState {
  isProcessing: boolean;
  progress: number;
  currentStep: string;
  result: RecipeProcessingResult | null;
  error: string | null;
}

export function useRecipePhotoProcessor() {
  const [state, setState] = useState<RecipePhotoProcessingState>({
    isProcessing: false,
    progress: 0,
    currentStep: "",
    result: null,
    error: null,
  });

  const updateProgress = useCallback((step: string, progress: number) => {
    setState((prev) => ({
      ...prev,
      currentStep: step,
      progress: Math.min(100, Math.max(0, progress)),
    }));
  }, []);

  const processRecipePhoto = useCallback(
    async (options: RecipePhotoProcessingOptions) => {
      setState({
        isProcessing: true,
        progress: 0,
        currentStep: "Initializing...",
        result: null,
        error: null,
      });

      try {
        updateProgress("Processing recipe photo...", 10);

        // Create FormData for server action
        const formData = new FormData();
        formData.append("file", options.file);
        if (options.placeId) formData.append("placeId", options.placeId);
        if (options.menuItemId)
          formData.append("menuItemId", options.menuItemId);

        updateProgress("Uploading and analyzing...", 50);

        // Call server action (handles auth, upload, and processing)
        const result = await processRecipePhotoAction(formData);

        if (!result.success) {
          throw new Error(result.error || "Processing failed");
        }

        updateProgress("Complete!", 100);

        setState((prev) => ({
          ...prev,
          result: result,
          isProcessing: false,
        }));

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        setState((prev) => ({
          ...prev,
          error: errorMessage,
          isProcessing: false,
          progress: 0,
          currentStep: "",
        }));
        throw error;
      }
    },
    [updateProgress],
  );

  const reset = useCallback(() => {
    setState({
      isProcessing: false,
      progress: 0,
      currentStep: "",
      result: null,
      error: null,
    });
  }, []);

  return {
    ...state,
    processRecipePhoto,
    reset,
  };
}
