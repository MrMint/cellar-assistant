import { Box, CircularProgress, Stack, Typography } from "@mui/joy";

export default function RecipesLoading() {
  return (
    <Box>
      <Typography level="h1" sx={{ mb: 3 }}>
        All Recipes
      </Typography>
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        justifyContent="center"
        sx={{ py: 4 }}
      >
        <CircularProgress size="sm" />
        <Typography level="body-sm" sx={{ color: "text.secondary" }}>
          Loading recipes...
        </Typography>
      </Stack>
    </Box>
  );
}
