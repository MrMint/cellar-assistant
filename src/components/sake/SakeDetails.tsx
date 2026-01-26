import type { FragmentOf } from "@cellar-assistant/shared";
import { readFragment } from "@cellar-assistant/shared";
import { Box, Card, CardContent, Chip, Typography } from "@mui/joy";
import { ItemBrands } from "../item/ItemBrands";
import { ItemCard } from "../item/ItemCard";
import { ItemRecipes } from "../item/ItemRecipes";
import { SakeDetailsFragment } from "./fragments";

interface SakeDetailsProps {
  sakeData: FragmentOf<typeof SakeDetailsFragment>;
}

export function SakeDetails({ sakeData }: SakeDetailsProps) {
  const sake = readFragment(SakeDetailsFragment, sakeData);

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
    </Box>
  );
}
