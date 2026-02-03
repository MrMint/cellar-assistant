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
import { addReviewAction } from "@/app/actions/reviews";
import { RichTextEditor } from "../common/RichTextEditor";

export type AddReviewResult = {
  userId: string;
  score?: number;
  text?: string;
};

interface AddBeerReviewProps {
  beerId: string;
  wineId?: never;
  spiritId?: never;
  coffeeId?: never;
}
interface AddWineReviewProps {
  wineId: string;
  beerId?: never;
  spiritId?: never;
  coffeeId?: never;
}
interface AddSpiritReviewProps {
  spiritId: string;
  beerId?: never;
  wineId?: never;
  coffeeId?: never;
}
interface AddCoffeeReviewProps {
  coffeeId: string;
  beerId?: never;
  wineId?: never;
  spiritId?: never;
}

export type AddReviewProps =
  | AddBeerReviewProps
  | AddWineReviewProps
  | AddCoffeeReviewProps
  | AddSpiritReviewProps;

export const AddReview = ({
  beerId,
  spiritId,
  wineId,
  coffeeId,
}: AddReviewProps) => {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<number>();
  const [text, setText] = useState<string>();

  const handleRatingClick = (rating: number) => {
    setScore(rating);
  };

  const dirty = isNotNil(score) || isNotNil(text);

  const handleClick = () => {
    if (dirty === true) {
      startTransition(async () => {
        const result = await addReviewAction({
          beerId,
          wineId,
          spiritId,
          coffeeId,
          score,
          text,
        });

        if (result.success) {
          setOpen(false);
          setScore(undefined);
          setText(undefined);
        }
      });
    }
  };

  if (open === false) {
    return (
      <Input placeholder="Add a Review..." onClick={() => setOpen(true)} />
    );
  }

  return (
    <Card>
      <Stack spacing={2}>
        <Typography level="title-lg">Add Review:</Typography>
        <CardContent>
          <Rating
            onClick={handleRatingClick}
            initialValue={score ?? 0}
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
          />
        </CardContent>
        <RichTextEditor
          placeholder="What did you think of it?"
          onChange={setText}
        />
      </Stack>
      <CardActions>
        <Button onClick={handleClick} disabled={!dirty} loading={isPending}>
          Add
        </Button>
      </CardActions>
    </Card>
  );
};
