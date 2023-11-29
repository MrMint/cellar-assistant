import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Input,
  Stack,
  Typography,
} from "@mui/joy";
import { addItemReview } from "@shared/queries";
import { isNotNil } from "ramda";
import { useState } from "react";
import { Rating } from "react-simple-star-rating";
import { useMutation } from "urql";
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
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<number>();
  const [text, setText] = useState<string>();
  const [{ fetching }, addItem] = useMutation(addItemReview);

  const dirty = isNotNil(score) || isNotNil(text);

  const handleClick = async () => {
    if (dirty === true) {
      await addItem({
        review: {
          beer_id: beerId,
          wine_id: wineId,
          spirit_id: spiritId,
          coffee_id: coffeeId,
          score,
          text,
        },
      });
      setOpen(false);
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
            onClick={setScore}
            showTooltip
            tooltipDefaultText="Your Score"
            tooltipArray={[
              "Bad",
              "Mediocre",
              "Good",
              "Very Good",
              "Outstanding",
            ]}
            readonly={fetching}
          />
        </CardContent>
        <RichTextEditor
          placeholder="What did you think of it?"
          onChange={setText}
        />
      </Stack>
      <CardActions>
        <Button onClick={handleClick} disabled={!dirty} loading={fetching}>
          Add
        </Button>
      </CardActions>
    </Card>
  );
};
