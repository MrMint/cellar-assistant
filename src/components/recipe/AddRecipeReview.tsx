"use client";

import { graphql } from "@cellar-assistant/shared";
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
import { useState } from "react";
import { Rating } from "react-simple-star-rating";
import { useMutation } from "urql";
import { RichTextEditor } from "../common/RichTextEditor";

// GraphQL mutation for adding recipe reviews
const AddRecipeReviewMutation = graphql(`
  mutation AddRecipeReview($review: recipe_reviews_insert_input!) {
    insert_recipe_reviews_one(object: $review) {
      id
      score
      text
      created_at
      user {
        id
        displayName
        avatarUrl
      }
    }
  }
`);

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
  const [{ fetching }, addReview] = useMutation(AddRecipeReviewMutation);

  const dirty = isNotNil(score) || isNotNil(text);

  const handleClick = async () => {
    if (dirty === true) {
      const result = await addReview({
        review: {
          recipe_id: recipeId,
          score,
          text,
        },
      });

      if (result.data?.insert_recipe_reviews_one) {
        setOpen(false);
        setScore(undefined);
        setText(undefined);

        if (onReviewAdded) {
          const user = result.data.insert_recipe_reviews_one.user as {
            id: string;
            displayName?: string;
            avatarUrl?: string;
          };
          onReviewAdded({
            userId: user.id,
            score,
            text,
          });
        }
      }
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
                readonly={fetching}
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
          loading={fetching}
          color="primary"
        >
          Add Review
        </Button>
        <Button onClick={handleCancel} variant="outlined" disabled={fetching}>
          Cancel
        </Button>
      </CardActions>
    </Card>
  );
};
