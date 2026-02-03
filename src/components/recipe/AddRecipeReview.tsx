"use client";

import {
  Button,
  Card,
  CardActions,
  CardContent,
  Input,
  Stack,
  Typography,
} from "@mui/joy";
import { isNotNil } from "ramda";
import { useState, useTransition } from "react";
import { Rating } from "react-simple-star-rating";
import { addRecipeReviewAction } from "@/app/actions/recipes";
import { RichTextEditor } from "../common/RichTextEditor";

export type AddRecipeReviewResult = {
  userId: string;
  score?: number;
  text?: string;
};

export type AddRecipeReviewProps = {
  recipeId: string;
  onReviewAdded?: (review: AddRecipeReviewResult) => void;
};

export const AddRecipeReview = ({
  recipeId,
  onReviewAdded,
}: AddRecipeReviewProps) => {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<number>();
  const [text, setText] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const dirty = isNotNil(score) || isNotNil(text);

  const handleClick = () => {
    if (dirty === true) {
      startTransition(async () => {
        const result = await addRecipeReviewAction(recipeId, score, text);

        if (result.success && result.userId) {
          setOpen(false);
          setScore(undefined);
          setText(undefined);

          if (onReviewAdded) {
            onReviewAdded({
              userId: result.userId,
              score,
              text,
            });
          }
        }
      });
    }
  };

  const handleCancel = () => {
    setOpen(false);
    setScore(undefined);
    setText(undefined);
  };

  if (open === false) {
    return (
      <Input
        placeholder="Add a review for this recipe..."
        onClick={() => setOpen(true)}
        sx={{ cursor: "pointer" }}
      />
    );
  }

  return (
    <Card>
      <Stack spacing={2}>
        <Typography level="title-lg">Add Recipe Review:</Typography>
        <CardContent>
          <Stack spacing={2}>
            <div>
              <Typography level="body-sm" sx={{ mb: 1 }}>
                Rate this recipe:
              </Typography>
              <Rating
                onClick={setScore}
                showTooltip
                tooltipDefaultText="Your Score"
                allowFraction
                tooltipArray={[
                  "Terrible",
                  "Bad",
                  "Bad+",
                  "Mediocre",
                  "Mediocre+",
                  "Good",
                  "Good+",
                  "Very Good",
                  "Very Good+",
                  "Outstanding",
                ]}
                readonly={isPending}
                initialValue={score}
              />
            </div>

            <RichTextEditor
              placeholder="How was this recipe? Did you make any modifications?"
              onChange={setText}
              value={text}
            />
          </Stack>
        </CardContent>
      </Stack>
      <CardActions>
        <Button
          onClick={handleClick}
          disabled={!dirty}
          loading={isPending}
          color="primary"
        >
          Add Review
        </Button>
        <Button onClick={handleCancel} variant="outlined" disabled={isPending}>
          Cancel
        </Button>
      </CardActions>
    </Card>
  );
};
