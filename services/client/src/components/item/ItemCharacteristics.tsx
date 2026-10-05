import { Box, Card, CardContent, Chip, Typography } from "@mui/joy";
import type { Characteristic } from "./adapter";

/**
 * The cards `82450ad1:src/components/{sake,tea}/{T}Details.tsx` rendered
 * inline under `ItemDetails`: "<Type> Characteristics" chips, and for tea the
 * "Flavor Profile" and "Ingredients" cards. Markup verbatim.
 */
export function ItemCharacteristics({
  title,
  characteristics,
  flavorProfile,
  ingredients,
}: {
  title: string | null;
  characteristics: Characteristic[];
  flavorProfile: string | null;
  ingredients: string | null;
}) {
  return (
    <>
      {title !== null && characteristics.length > 0 && (
        <Card>
          <CardContent>
            <Typography level="title-lg" sx={{ mb: 1 }}>
              {title}
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {characteristics.map((char) => (
                <Chip key={char.label} variant="outlined">
                  {char.label}: {char.value}
                </Chip>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}
      {flavorProfile !== null && (
        <Card>
          <CardContent>
            <Typography level="title-lg" sx={{ mb: 1 }}>
              Flavor Profile
            </Typography>
            <Typography>{flavorProfile}</Typography>
          </CardContent>
        </Card>
      )}
      {ingredients !== null && (
        <Card>
          <CardContent>
            <Typography level="title-lg" sx={{ mb: 1 }}>
              Ingredients
            </Typography>
            <Typography>{ingredients}</Typography>
          </CardContent>
        </Card>
      )}
    </>
  );
}
