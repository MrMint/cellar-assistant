import {
  Button,
  Card,
  CardActions,
  CardContent,
  Input,
  Stack,
  Typography,
} from "@mui/joy";
import { useUserId } from "@nhost/nextjs";
import { ItemType, Item_Reviews } from "@shared/gql/graphql";
import { addItemReview } from "@shared/queries";
import { isNotNil } from "ramda";
import { useState } from "react";
import { Rating } from "react-simple-star-rating";
import { useMutation } from "urql";
import { Item, getItemType } from "@/utilities";
import { RichTextEditor } from "../common/RichTextEditor";

export type AddReviewResult = {
  userId: string;
  score?: number;
  text?: string;
};

interface AddItemReviewProps {
  item: Item;
}

const getAddItemPayload = (item: Item, score?: number, text?: string) => {
  const itemType = getItemType(item.__typename);
  return {
    review: {
      beer_id: itemType === ItemType.Beer ? item?.id : undefined,
      wine_id: itemType === ItemType.Wine ? item?.id : undefined,
      spirit_id: itemType === ItemType.Spirit ? item?.id : undefined,
      coffee_id: itemType === ItemType.Coffee ? item?.id : undefined,
      score,
      text,
    },
  };
};

export const AddReview = ({ item }: AddItemReviewProps) => {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<number>();
  const [text, setText] = useState<string>();
  const userId = useUserId();
  const [{ fetching }, addItem] = useMutation(addItemReview);

  const dirty = isNotNil(score) || isNotNil(text);
  const existingReview = item?.reviews?.find(
    (review: Item_Reviews) => review.user.id === userId,
  );

  if (existingReview) {
    return null;
  }

  if (open === false) {
    return (
      <Input placeholder="Add a Review..." onClick={() => setOpen(true)} />
    );
  }

  const handleClick = async () => {
    if (dirty === true) {
      await addItem(getAddItemPayload(item, score, text));
      setOpen(false);
    }
  };

  return (
    <Card>
      <Stack spacing={2}>
        <Typography level="title-lg">Add Review:</Typography>
        <CardContent>
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
