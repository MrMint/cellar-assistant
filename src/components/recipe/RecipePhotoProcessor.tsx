"use client";

import { MdCheckCircle, MdError, MdPhotoCamera } from "react-icons/md";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/joy";
import type React from "react";
import { useRef, useState } from "react";
import { useRecipePhotoProcessor } from "../../hooks/useRecipePhotoProcessor";

interface RecipePhotoProcessorProps {
  placeId?: string;
  menuItemId?: string;
  onRecipesCreated?: (recipeIds: string[]) => void;
  onProcessingComplete?: () => void;
}

export function RecipePhotoProcessor({
  placeId,
  menuItemId,
  onRecipesCreated,
  onProcessingComplete,
}: RecipePhotoProcessorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const {
    isProcessing,
    progress,
    currentStep,
    result,
    error,
    processRecipePhoto,
    reset,
  } = useRecipePhotoProcessor();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file?.type.startsWith("image/")) {
      setSelectedFile(file);
      // Clear any previous results
      reset();
    }
  };

  const handleUploadAndProcess = async () => {
    if (!selectedFile) return;

    try {
      const result = await processRecipePhoto({
        file: selectedFile,
        placeId,
        menuItemId,
      });

      if (result.success) {
        // Notify parent components
        if (result.results && result.results.length > 0) {
          const successfulRecipeIds = result.results
            .filter(
              (r): r is typeof r & { recipeId: string } =>
                r.success && r.recipeId !== undefined,
            )
            .map((r) => r.recipeId);

          onRecipesCreated?.(successfulRecipeIds);
        }
      }

      onProcessingComplete?.();
    } catch (error) {
      console.error("Recipe photo processing failed:", error);
    }
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={3}>
          {/* Header */}
          <Box>
            <Typography level="h3" startDecorator={<MdPhotoCamera />}>
              AI Recipe Generator
            </Typography>
            <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
              Simply upload a photo and our AI will intelligently extract all
              visible recipes with ingredients and instructions
            </Typography>
          </Box>

          {/* File Upload */}
          <Box>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
            <Button
              variant="outlined"
              onClick={() => fileInputRef.current?.click()}
              startDecorator={<MdPhotoCamera />}
              fullWidth
              disabled={isProcessing}
            >
              {selectedFile ? `Selected: ${selectedFile.name}` : "Choose Photo"}
            </Button>
          </Box>

          {/* Process Button */}
          <Button
            variant="solid"
            color="primary"
            onClick={handleUploadAndProcess}
            disabled={!selectedFile || isProcessing}
            loading={isProcessing}
            loadingIndicator={<CircularProgress size="sm" />}
            fullWidth
            size="lg"
          >
            {isProcessing ? "Processing..." : "Extract Recipes"}
          </Button>

          {/* Progress Display */}
          {isProcessing && (
            <Box>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 1,
                }}
              >
                <Typography level="body-sm">{currentStep}</Typography>
                <Typography level="body-sm">{Math.round(progress)}%</Typography>
              </Box>
              <LinearProgress
                determinate
                value={progress}
                sx={{ height: 8, borderRadius: 4 }}
              />
            </Box>
          )}

          {/* Error Display */}
          {error && (
            <Alert color="danger" startDecorator={<MdError />}>
              <Box>
                <Typography level="body-sm" sx={{ fontWeight: "lg" }}>
                  Processing Failed
                </Typography>
                <Typography level="body-sm">{error}</Typography>
              </Box>
            </Alert>
          )}

          {/* Results Display */}
          {result && (
            <Box>
              <Divider sx={{ my: 2 }} />

              <Alert
                color={result.success ? "success" : "warning"}
                startDecorator={
                  result.success ? <MdCheckCircle /> : <MdError />
                }
              >
                <Box>
                  <Typography level="body-sm" sx={{ fontWeight: "lg" }}>
                    Processing Complete
                  </Typography>
                  <Typography level="body-sm">
                    {result.success
                      ? `Successfully created ${result.recipesCreated} recipe(s) with ${result.totalIngredients} ingredients`
                      : "Some recipes could not be created"}
                  </Typography>
                </Box>
              </Alert>

              {/* Menu Analysis */}
              {result.menuAnalysis && (
                <Box sx={{ mt: 2 }}>
                  <Typography level="body-sm" sx={{ fontWeight: "lg", mb: 1 }}>
                    Menu Analysis:
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                    {result.menuAnalysis.restaurant_type && (
                      <Chip variant="soft" color="primary">
                        {result.menuAnalysis.restaurant_type}
                      </Chip>
                    )}
                    <Chip variant="soft" color="neutral">
                      {result.menuAnalysis.recipes_extracted} recipes extracted
                    </Chip>
                    <Chip variant="soft" color="success">
                      {result.menuAnalysis.extraction_method}
                    </Chip>
                  </Box>
                </Box>
              )}

              {/* Enhancement Stats */}
              {result.enhancementsApplied > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
                    Applied {result.enhancementsApplied} ingredient enhancements
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
