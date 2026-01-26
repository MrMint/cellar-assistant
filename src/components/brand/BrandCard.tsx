"use client";

import { CardContent, CardOverflow, Chip, Divider, Typography } from "@mui/joy";
import type { SxProps } from "@mui/joy/styles/types";
import Image from "next/image";
import { isNil, isNotNil } from "ramda";
import { MdBusiness, MdLocalBar, MdLocationOn } from "react-icons/md";
import { InteractiveCard } from "@/components/common/InteractiveCard";
import { Link } from "@/components/common/Link";
import cellar1 from "@/images/cellar1.png"; // Using as brand placeholder

const overflowItemStyles: SxProps = {
  justifyContent: "center",
  textAlign: "center",
  flexGrow: 1,
  py: 1,
};

const getBrandTypeIcon = (brandType: string) => {
  switch (brandType) {
    case "brewery":
    case "distillery":
    case "winery":
    case "roastery":
      return <MdLocalBar />;
    case "restaurant_chain":
      return <MdLocationOn />;
    default:
      return <MdBusiness />;
  }
};

const getBrandTypeColor = (brandType: string) => {
  switch (brandType) {
    case "brewery":
      return "warning";
    case "distillery":
      return "neutral";
    case "winery":
      return "danger";
    case "roastery":
      return "primary";
    case "restaurant_chain":
      return "success";
    default:
      return "neutral";
  }
};

const formatBrandType = (brandType: string) => {
  return brandType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
};

export type BrandCardItem = {
  id: string;
  name: string;
  description?: string | null;
  logo_url?: string | null;
  brand_type: string;
  parent_brand_id?: string | null;
  item_count?: number; // Count of associated items
  place_count?: number; // Count of associated places
  parent_brand?: {
    id: string;
    name: string;
  } | null;
};

export type BrandCardProps = {
  brand: BrandCardItem;
  href?: string;
  onClick?: (brandId: string) => void;
};

export const BrandCard = ({ brand, href, onClick }: BrandCardProps) => {
  return (
    <InteractiveCard
      onClick={isNotNil(onClick) ? () => onClick(brand.id) : undefined}
    >
      <CardOverflow
        sx={{ aspectRatio: { xs: 1.2, sm: 1 }, padding: 2, overflow: "hidden" }}
      >
        {isNotNil(brand.logo_url) && (
          <Image
            style={{
              aspectRatio: "1",
              objectFit: "contain",
              height: "auto",
              width: "auto",
            }}
            src={brand.logo_url}
            alt={`${brand.name} logo`}
            height={200}
            width={200}
          />
        )}
        {isNil(brand.logo_url) && (
          <Image
            src={cellar1}
            alt={`${brand.name} placeholder`}
            fill
            placeholder="blur"
            style={{ objectFit: "contain" }}
          />
        )}

        {/* Brand type badge */}
        <Chip
          variant="soft"
          color={getBrandTypeColor(brand.brand_type)}
          size="sm"
          startDecorator={getBrandTypeIcon(brand.brand_type)}
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 1,
          }}
        >
          {formatBrandType(brand.brand_type)}
        </Chip>
      </CardOverflow>

      {isNotNil(href) && (
        <CardContent>
          <Link overlay href={href}>
            <Typography level="title-md" noWrap>
              {brand.name}
            </Typography>
          </Link>
          {isNotNil(brand.description) && (
            <Typography
              level="body-sm"
              sx={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                mt: 0.5,
              }}
            >
              {brand.description}
            </Typography>
          )}
          {isNotNil(brand.parent_brand) && (
            <Typography
              level="body-sm"
              sx={{ color: "text.secondary", mt: 0.5 }}
            >
              Part of {brand.parent_brand.name}
            </Typography>
          )}
        </CardContent>
      )}

      {isNil(href) && isNotNil(onClick) && (
        <CardContent>
          <Typography level="title-md" noWrap>
            {brand.name}
          </Typography>
          {isNotNil(brand.description) && (
            <Typography
              level="body-sm"
              sx={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                mt: 0.5,
              }}
            >
              {brand.description}
            </Typography>
          )}
          {isNotNil(brand.parent_brand) && (
            <Typography
              level="body-sm"
              sx={{ color: "text.secondary", mt: 0.5 }}
            >
              Part of {brand.parent_brand.name}
            </Typography>
          )}
        </CardContent>
      )}

      <CardOverflow
        variant="soft"
        sx={{
          display: "flex",
          flexDirection: "row",
          gap: 1,
          justifyContent: "space-around",
          overflow: "hidden",
          alignItems: "center",
          padding: 0,
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        {/* Item count */}
        {isNotNil(brand.item_count) && (
          <Typography
            sx={overflowItemStyles}
            endDecorator={<MdLocalBar />}
            level="body-sm"
          >
            {brand.item_count} items
          </Typography>
        )}

        {isNotNil(brand.item_count) && isNotNil(brand.place_count) && (
          <Divider orientation="vertical" />
        )}

        {/* Place count */}
        {isNotNil(brand.place_count) && (
          <Typography
            sx={overflowItemStyles}
            endDecorator={<MdLocationOn />}
            level="body-sm"
          >
            {brand.place_count} places
          </Typography>
        )}
      </CardOverflow>
    </InteractiveCard>
  );
};
