import { Button, Card, CardContent, Stack, Typography } from "@mui/joy";
import { type CatalogMatch, catalogMatchSummary } from "./catalog-match";

type CatalogMatchPromptProps = {
  match: CatalogMatch;
  /** In a cellar the tap files a bottle; elsewhere it opens the item. */
  inCellar: boolean;
  onUse: () => void;
  onDismiss: () => void;
};

/**
 * N19: "Is it this one? +1 bottle", above the form when the label names an
 * item the catalogue already holds at the same vintage. One tap files another
 * bottle of it; "No, it's new" goes back to the form, and the item is not
 * offered again in this wizard.
 *
 * Markup only, on Joy for now; the shadcn migration (D20) replaces it whole.
 */
export const CatalogMatchPrompt = ({
  match,
  inCellar,
  onUse,
  onDismiss,
}: CatalogMatchPromptProps) => (
  <Card variant="soft" color="primary" sx={{ maxWidth: 600 }}>
    <CardContent>
      <Stack spacing={1.5}>
        <Typography level="title-md">Is it this one?</Typography>
        <Stack spacing={0.25}>
          <Typography level="body-lg" fontWeight="lg">
            {match.item.name}
          </Typography>
          {catalogMatchSummary(match) !== "" && (
            <Typography level="body-sm">
              {catalogMatchSummary(match)}
            </Typography>
          )}
        </Stack>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button onClick={onUse}>
            {inCellar ? "+1 bottle" : "Use this item"}
          </Button>
          <Button variant="plain" color="neutral" onClick={onDismiss}>
            No, it&apos;s new
          </Button>
        </Stack>
      </Stack>
    </CardContent>
  </Card>
);
