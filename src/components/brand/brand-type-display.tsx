import type { ColorPaletteProp } from "@mui/joy/styles/types";
import type { ReactNode } from "react";
import {
  MdBusiness,
  MdLocalBar,
  MdLocalCafe,
  MdLocationOn,
} from "react-icons/md";

/**
 * Shared presentation helpers for a brand's `brand_type`, used by both
 * BrandCard and BrandDetails so the icon/color/label stay in sync.
 */

export const getBrandTypeIcon = (brandType: string): ReactNode => {
  switch (brandType) {
    case "brewery":
    case "distillery":
    case "winery":
    case "kura":
      return <MdLocalBar />;
    case "roastery":
    case "tea_house":
      return <MdLocalCafe />;
    case "restaurant_chain":
      return <MdLocationOn />;
    default:
      return <MdBusiness />;
  }
};

export const getBrandTypeColor = (brandType: string): ColorPaletteProp => {
  switch (brandType) {
    case "brewery":
      return "warning";
    case "distillery":
      return "neutral";
    case "winery":
      return "danger";
    case "roastery":
    case "kura":
      return "primary";
    case "restaurant_chain":
    case "tea_house":
      return "success";
    default:
      return "neutral";
  }
};

export const formatBrandType = (brandType: string): string => {
  return brandType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
};
