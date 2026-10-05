import { Button, Card, CardActions, Stack, Typography } from "@mui/joy";

export type FinalPromptProps = {
  onYes: () => void;
  onNo: () => void;
};
export const FinalPrompt = ({ onYes, onNo }: FinalPromptProps) => (
  <Card>
    <Stack spacing={2}>
      <Typography level="title-lg">
        Would you like to add another item?
      </Typography>
    </Stack>
    <CardActions buttonFlex="0 1 120px" sx={{ justifyContent: "flex-end" }}>
      <Button onClick={onNo} variant="outlined" color="neutral">
        No
      </Button>
      <Button onClick={onYes}>Yes</Button>
    </CardActions>
  </Card>
);
