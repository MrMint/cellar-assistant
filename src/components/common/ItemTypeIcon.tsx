import type { ItemTypeValue } from "@cellar-assistant/shared";
import {
  FaBeer,
  FaCocktail,
  FaCoffee,
  FaGlassWhiskey,
  FaWineGlass,
} from "react-icons/fa";

export function ItemTypeIcon({ type }: { type: ItemTypeValue }) {
  switch (type) {
    case "BEER":
      return <FaBeer />;
    case "WINE":
      return <FaWineGlass />;
    case "SPIRIT":
      return <FaCocktail />;
    case "COFFEE":
      return <FaCoffee />;
    case "SAKE":
      return <FaGlassWhiskey />;
  }
}
