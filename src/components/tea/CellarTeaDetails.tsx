import { type FragmentOf, readFragment } from "@cellar-assistant/shared";
import { Box, Card, CardContent, Chip, Typography } from "@mui/joy";
import { ItemBrands } from "../item/ItemBrands";
import { ItemCard } from "../item/ItemCard";
import { ItemRecipes } from "../item/ItemRecipes";
import {
  CellarTeaDetailsFragment,
  type UserWithFriendsFragment,
} from "./fragments";

interface CellarTeaDetailsProps {
  cellarItem: FragmentOf<typeof CellarTeaDetailsFragment>;
  user: FragmentOf<typeof UserWithFriendsFragment>;
}

export function CellarTeaDetails({
  cellarItem,
  user: _user,
}: CellarTeaDetailsProps) {
  const item = readFragment(CellarTeaDetailsFragment, cellarItem);
  const tea = item.tea;

  if (!tea) {
    return <div>Tea not found</div>;
  }

  const characteristics = [
    { label: "Category", value: tea.category },
    { label: "Form", value: tea.form },
    { label: "Caffeine", value: tea.caffeine_level },
    { label: "Oxidation", value: tea.oxidation_level },
    { label: "Processing", value: tea.processing },
    { label: "Cultivar", value: tea.cultivar },
    { label: "Harvest Year", value: tea.harvest_year },
    { label: "Steep Temp", value: tea.steeping_temperature },
    { label: "Steep Time", value: tea.steeping_time },
    { label: "Country", value: tea.country },
    { label: "Region", value: tea.region },
    { label: "Organic", value: tea.is_organic ? "Yes" : undefined },
    { label: "Fair Trade", value: tea.is_fair_trade ? "Yes" : undefined },
  ].filter((item) => item.value !== null && item.value !== undefined);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* Main item card */}
      <ItemCard
        item={{
          id: tea.id,
          itemId: tea.id,
          name: tea.name,
        }}
        type={"TEA"}
      />

      {/* Tea characteristics */}
      <Card>
        <CardContent>
          <Typography level="h3" sx={{ mb: 2 }}>
            Tea Characteristics
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
      {tea.brands && tea.brands.length > 0 && (
        <ItemBrands brands={tea.brands} />
      )}

      {/* Recipes */}
      {tea.recipe_ingredients && tea.recipe_ingredients.length > 0 && (
        <ItemRecipes
          recipeIngredients={tea.recipe_ingredients}
          itemName={tea.name}
        />
      )}

      {/* Ingredients */}
      {tea.ingredients && (
        <Card>
          <CardContent>
            <Typography level="h3" sx={{ mb: 1 }}>
              Ingredients
            </Typography>
            <Typography>{tea.ingredients}</Typography>
          </CardContent>
        </Card>
      )}

      {/* Flavor profile */}
      {tea.flavor_profile && (
        <Card>
          <CardContent>
            <Typography level="h3" sx={{ mb: 1 }}>
              Flavor Profile
            </Typography>
            <Typography>{tea.flavor_profile}</Typography>
          </CardContent>
        </Card>
      )}

      {/* Description */}
      {tea.description && (
        <Card>
          <CardContent>
            <Typography level="h3" sx={{ mb: 1 }}>
              Description
            </Typography>
            <Typography>{tea.description}</Typography>
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
            {item.check_ins.slice(0, 5).map((checkin) => (
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
