import { readFragment } from "@cellar-assistant/shared";
import { Box, Card, CardContent, Chip, Typography } from "@mui/joy";
import { ItemBrands } from "../item/ItemBrands";
import { ItemCard } from "../item/ItemCard";
import { ItemRecipes } from "../item/ItemRecipes";
import { CellarSakeDetailsFragment } from "./fragments";

interface CellarSakeDetailsProps {
  cellarItem: any; // Replace with proper type from fragments
  user: any; // Replace with proper type from fragments
}

export function CellarSakeDetails({
  cellarItem,
  user,
}: CellarSakeDetailsProps) {
  const item = readFragment(CellarSakeDetailsFragment, cellarItem);
  const sake = item.sake;

  if (!sake) {
    return <div>Sake not found</div>;
  }

  const characteristics = [
    { label: "Category", value: sake.category },
    { label: "Type", value: sake.type },
    {
      label: "Polish Grade",
      value: sake.polish_grade ? `${sake.polish_grade}%` : undefined,
    },
    {
      label: "ABV",
      value: sake.alcohol_content_percentage
        ? `${sake.alcohol_content_percentage}%`
        : undefined,
    },
    { label: "SMV", value: sake.sake_meter_value },
    { label: "Acidity", value: sake.acidity },
    { label: "Rice Variety", value: sake.rice_variety },
    { label: "Serving Temp", value: sake.serving_temperature },
    { label: "Vintage", value: sake.vintage },
    { label: "Region", value: sake.region },
  ].filter((item) => item.value !== null && item.value !== undefined);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* Main item card */}
      <ItemCard
        item={{
          id: sake.id,
          itemId: sake.id,
          name: sake.name,
        }}
        type={"SAKE"}
      />

      {/* Sake characteristics */}
      <Card>
        <CardContent>
          <Typography level="h3" sx={{ mb: 2 }}>
            Sake Characteristics
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

      {/* Brands */}
      {sake.brands && sake.brands.length > 0 && (
        <ItemBrands brands={sake.brands} />
      )}

      {/* Recipes */}
      {sake.recipe_ingredients && sake.recipe_ingredients.length > 0 && (
        <ItemRecipes
          recipeIngredients={sake.recipe_ingredients}
          itemName={sake.name}
        />
      )}

      {/* Description */}
      {sake.description && (
        <Card>
          <CardContent>
            <Typography level="h3" sx={{ mb: 1 }}>
              Description
            </Typography>
            <Typography>{sake.description}</Typography>
          </CardContent>
        </Card>
      )}

      {/* Check-ins */}
      {item.check_ins && item.check_ins.length > 0 && (
        <Card>
          <CardContent>
            <Typography level="h3" sx={{ mb: 1 }}>
              Recent Check-ins
            </Typography>
            {item.check_ins.slice(0, 5).map((checkin: any) => (
              <Box key={checkin.id} sx={{ mb: 1 }}>
                <Typography level="body-sm">
                  {checkin.user.displayName} -{" "}
                  {new Date(checkin.createdAt).toLocaleDateString()}
                </Typography>
              </Box>
            ))}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
