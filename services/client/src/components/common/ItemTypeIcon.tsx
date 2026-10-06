import {
  FaBeer,
  FaCocktail,
  FaCoffee,
  FaGlassWhiskey,
  FaMugHot,
  FaWineGlass,
} from "react-icons/fa";
import type { ApiItemType as ItemTypeValue } from "@/components/cellar-api/itemTypes";

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
    case "TEA":
      return <FaMugHot />;
  }
}
