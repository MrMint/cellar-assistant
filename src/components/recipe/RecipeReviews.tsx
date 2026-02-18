"use client";

import {
  Accordion,
  AccordionDetails,
  AccordionGroup,
  AccordionSummary,
  Card,
  ListItemContent,
  Typography,
} from "@mui/joy";
import { format, parseISO } from "date-fns";
import { isEmpty, isNotNil, not } from "ramda";
import { Rating } from "react-simple-star-rating";
import { RichTextDisplay } from "../common/RichTextDisplay";
import { UserAvatar } from "../common/UserAvatar";

export type RecipeReview = {
  id: string;
  score?: number;
  user: {
    displayName: string;
    avatarUrl: string;
  };
  text?: string | null;
  created_at: string;
};

export type RecipeReviewsProps = {
  reviews: RecipeReview[];
};

export const RecipeReviews = ({ reviews }: RecipeReviewsProps) => {
  const hasReviews = not(isEmpty(reviews));
  return (
    <Card sx={{ padding: "0" }}>
      <Typography level="title-lg" padding="1rem 0 0 1rem">
        Reviews:
      </Typography>
      {!hasReviews && (
        <Typography
          level="body-lg"
          padding="1rem"
          justifyContent="center"
          textAlign="center"
        >
          No reviews yet! Want to add one?
        </Typography>
      )}
      {hasReviews && (
        <AccordionGroup>
          {reviews.map((x) => (
            <Accordion key={x.id}>
              <AccordionSummary>
                <UserAvatar avatarUrl={x.user.avatarUrl} displayName={x.user.displayName} />
                <ListItemContent>
                  <Typography level="title-md">{x.user.displayName}</Typography>
                  <Rating
                    initialValue={x.score}
                    allowFraction
                    size={25}
                    readonly
                  />
                </ListItemContent>
                <Typography>
                  {format(parseISO(x.created_at), "MM/dd/yyyy")}
                </Typography>
              </AccordionSummary>
              {isNotNil(x.text) && (
                <AccordionDetails>
                  <RichTextDisplay text={x.text} />
                </AccordionDetails>
              )}
            </Accordion>
          ))}
        </AccordionGroup>
      )}
    </Card>
  );
};
