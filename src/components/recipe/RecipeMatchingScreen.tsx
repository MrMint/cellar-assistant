"use client";

import {
  AspectRatio,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Typography,
} from "@mui/joy";
import Image from "next/image";
import { useState } from "react";
import { MdCheck, MdClose, MdRestaurant, MdStar } from "react-icons/md";
import { CanonicalRecipeBadge } from "./CanonicalRecipeBadge";

export type RecipeMatchSuggestion = {
  recipeGroup: {
    id: string;
    name: string;
    description?: string | null;
    category: string;
    canonical_recipe?: {
      id: string;
      name: string;
      image_url?: string | null;
      difficulty_level?: number | null;
      prep_time_minutes?: number | null;
    } | null;
    recipes_aggregate: {
      aggregate: {
        count: number;
      };
    };
  };
  similarity_score: number;
  confidence: "high" | "medium" | "low";
};

export type RecipeMatchingScreenProps = {
  isOpen: boolean;
  onClose: () => void;
  detectedRecipeName: string;
  placeName?: string;
  suggestions: RecipeMatchSuggestion[];
  onSelectExisting: (groupId: string) => void;
  onCreateNew: () => void;
  isLoading?: boolean;
};

export const RecipeMatchingScreen = ({
  isOpen,
  onClose,
  detectedRecipeName,
  placeName,
  suggestions,
  onSelectExisting,
  onCreateNew,
  isLoading = false,
}: RecipeMatchingScreenProps) => {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const handleSelectGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
  };

  const handleConfirmSelection = () => {
    if (selectedGroupId) {
      onSelectExisting(selectedGroupId);
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case "high":
        return "success";
      case "medium":
        return "warning";
      case "low":
        return "danger";
      default:
        return "neutral";
    }
  };

  const getConfidenceLabel = (confidence: string) => {
    switch (confidence) {
      case "high":
        return "High Match";
      case "medium":
        return "Possible Match";
      case "low":
        return "Low Match";
      default:
        return "Unknown";
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose}>
      <ModalDialog
        variant="outlined"
        size="lg"
        sx={{
          maxWidth: "90vw",
          maxHeight: "90vh",
          overflow: "auto",
        }}
      >
        <ModalClose />

        <Box sx={{ p: 2 }}>
          {/* Header */}
          <Stack spacing={2} sx={{ mb: 3 }}>
            <Typography
              level="h3"
              sx={{ display: "flex", alignItems: "center", gap: 1 }}
            >
              <MdRestaurant />
              Recipe Found
            </Typography>

            <Box>
              <Typography level="title-lg" sx={{ mb: 1 }}>
                "{detectedRecipeName}"
              </Typography>
              {placeName && (
                <Typography level="body-md" sx={{ color: "text.secondary" }}>
                  from {placeName}
                </Typography>
              )}
            </Box>

            <Typography level="body-md">
              We found similar recipes in our database. Would you like to add
              this as a new version of an existing recipe group, or create a new
              recipe group?
            </Typography>
          </Stack>

          <Divider sx={{ my: 2 }} />

          {/* Suggestions */}
          {suggestions.length > 0 ? (
            <>
              <Typography level="title-md" sx={{ mb: 2 }}>
                Similar Recipe Groups
              </Typography>

              <Grid container spacing={2} sx={{ mb: 3 }}>
                {suggestions.map((suggestion) => (
                  <Grid key={suggestion.recipeGroup.id} xs={12} sm={6}>
                    <Card
                      variant={
                        selectedGroupId === suggestion.recipeGroup.id
                          ? "solid"
                          : "outlined"
                      }
                      color={
                        selectedGroupId === suggestion.recipeGroup.id
                          ? "primary"
                          : "neutral"
                      }
                      sx={{
                        cursor: "pointer",
                        transition: "all 0.2s ease-in-out",
                        "&:hover": {
                          transform: "translateY(-2px)",
                          boxShadow: "lg",
                        },
                      }}
                      onClick={() =>
                        handleSelectGroup(suggestion.recipeGroup.id)
                      }
                    >
                      <CardContent>
                        <Stack spacing={2}>
                          {/* Recipe Group Image */}
                          {suggestion.recipeGroup.canonical_recipe
                            ?.image_url && (
                            <AspectRatio ratio="16/9">
                              <Image
                                src={
                                  suggestion.recipeGroup.canonical_recipe
                                    .image_url
                                }
                                alt={suggestion.recipeGroup.name}
                                fill
                                style={{ objectFit: "cover" }}
                              />
                            </AspectRatio>
                          )}

                          {/* Recipe Group Info */}
                          <Box>
                            <Stack
                              direction="row"
                              spacing={1}
                              alignItems="center"
                              sx={{ mb: 1 }}
                            >
                              <Typography level="title-sm">
                                {suggestion.recipeGroup.name}
                              </Typography>
                              {suggestion.recipeGroup.canonical_recipe && (
                                <CanonicalRecipeBadge
                                  size="sm"
                                  showText={false}
                                />
                              )}
                            </Stack>

                            {suggestion.recipeGroup.description && (
                              <Typography
                                level="body-sm"
                                sx={{
                                  color:
                                    selectedGroupId ===
                                    suggestion.recipeGroup.id
                                      ? "primary.100"
                                      : "text.secondary",
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                }}
                              >
                                {suggestion.recipeGroup.description}
                              </Typography>
                            )}
                          </Box>

                          {/* Match Info */}
                          <Stack direction="row" spacing={1} flexWrap="wrap">
                            <Chip
                              size="sm"
                              variant="soft"
                              color={getConfidenceColor(suggestion.confidence)}
                            >
                              {getConfidenceLabel(suggestion.confidence)}
                            </Chip>

                            <Chip size="sm" variant="soft" color="neutral">
                              {Math.round(suggestion.similarity_score * 100)}%
                              similar
                            </Chip>

                            {suggestion.recipeGroup.recipes_aggregate.aggregate
                              .count > 1 && (
                              <Chip size="sm" variant="soft" color="primary">
                                {
                                  suggestion.recipeGroup.recipes_aggregate
                                    .aggregate.count
                                }{" "}
                                versions
                              </Chip>
                            )}
                          </Stack>

                          {/* Recipe Details */}
                          {suggestion.recipeGroup.canonical_recipe && (
                            <Stack
                              direction="row"
                              spacing={2}
                              sx={{ fontSize: "sm" }}
                            >
                              {suggestion.recipeGroup.canonical_recipe
                                .difficulty_level && (
                                <Typography level="body-xs">
                                  Difficulty:{" "}
                                  {
                                    suggestion.recipeGroup.canonical_recipe
                                      .difficulty_level
                                  }
                                  /5
                                </Typography>
                              )}
                              {suggestion.recipeGroup.canonical_recipe
                                .prep_time_minutes && (
                                <Typography level="body-xs">
                                  {
                                    suggestion.recipeGroup.canonical_recipe
                                      .prep_time_minutes
                                  }
                                  min
                                </Typography>
                              )}
                            </Stack>
                          )}
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </>
          ) : (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <MdRestaurant
                size={48}
                style={{
                  color: "var(--joy-palette-neutral-400)",
                  marginBottom: 16,
                }}
              />
              <Typography level="title-md" sx={{ mb: 1 }}>
                No Similar Recipes Found
              </Typography>
              <Typography level="body-md" sx={{ color: "text.secondary" }}>
                This appears to be a new recipe. We'll create a new recipe group
                for it.
              </Typography>
            </Box>
          )}

          {/* Action Buttons */}
          <Stack direction="row" spacing={2} justifyContent="flex-end">
            <Button
              variant="outlined"
              color="neutral"
              startDecorator={<MdClose />}
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>

            <Button
              variant="outlined"
              color="primary"
              startDecorator={<MdStar />}
              onClick={onCreateNew}
              disabled={isLoading}
            >
              Create New Recipe Group
            </Button>

            {suggestions.length > 0 && (
              <Button
                variant="solid"
                color="primary"
                startDecorator={<MdCheck />}
                onClick={handleConfirmSelection}
                disabled={!selectedGroupId || isLoading}
                loading={isLoading}
              >
                Add to Selected Group
              </Button>
            )}
          </Stack>
        </Box>
      </ModalDialog>
    </Modal>
  );
};
