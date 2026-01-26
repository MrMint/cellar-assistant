"use client";

import { Box, Card, CardContent, Chip, Stack, Typography } from "@mui/joy";
import Image from "next/image";
import { isNotNil } from "ramda";
import { MdBusiness } from "react-icons/md";
import { Link } from "@/components/common/Link";

const getBrandTypeColor = (brandType: string | null) => {
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

const formatBrandType = (brandType: string | null) => {
  if (!brandType) return "Other";
  return brandType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
};

export type ItemBrand = {
  id: string;
  is_primary?: boolean | null;
  brand: {
    id: string;
    name: string;
    logo_url?: string | null;
    brand_type: string | null;
  };
};

export type ItemBrandsProps = {
  brands: ItemBrand[];
  title?: string;
};

export const ItemBrands = ({ brands, title = "Brands" }: ItemBrandsProps) => {
  if (brands.length === 0) {
    return null;
  }

  const primaryBrand = brands.find((b) => b.is_primary);
  const otherBrands = brands.filter((b) => !b.is_primary);

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography level="title-sm" sx={{ mb: 2 }}>
          {title} ({brands.length})
        </Typography>

        <Stack spacing={2}>
          {/* Primary brand (if exists) */}
          {primaryBrand && (
            <Box>
              <Stack direction="row" spacing={2} alignItems="center">
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: "sm",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: "background.level1",
                  }}
                >
                  {isNotNil(primaryBrand.brand.logo_url) ? (
                    <Image
                      src={primaryBrand.brand.logo_url}
                      alt={`${primaryBrand.brand.name} logo`}
                      width={48}
                      height={48}
                      style={{ objectFit: "contain" }}
                    />
                  ) : (
                    <MdBusiness
                      size={24}
                      style={{ color: "var(--joy-palette-neutral-500)" }}
                    />
                  )}
                </Box>

                <Box sx={{ flex: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Link href={`/brands/${primaryBrand.brand.id}`}>
                      <Typography
                        level="body-md"
                        fontWeight="md"
                        sx={{ textDecoration: "underline" }}
                      >
                        {primaryBrand.brand.name}
                      </Typography>
                    </Link>
                    <Chip variant="solid" color="primary" size="sm">
                      Primary
                    </Chip>
                  </Stack>
                  <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                    {formatBrandType(primaryBrand.brand.brand_type)}
                  </Typography>
                </Box>
              </Stack>
            </Box>
          )}

          {/* Other brands */}
          {otherBrands.map((brandRelation) => (
            <Box key={brandRelation.id}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: "sm",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: "background.level1",
                  }}
                >
                  {isNotNil(brandRelation.brand.logo_url) ? (
                    <Image
                      src={brandRelation.brand.logo_url}
                      alt={`${brandRelation.brand.name} logo`}
                      width={40}
                      height={40}
                      style={{ objectFit: "contain" }}
                    />
                  ) : (
                    <MdBusiness
                      size={20}
                      style={{ color: "var(--joy-palette-neutral-500)" }}
                    />
                  )}
                </Box>

                <Box sx={{ flex: 1 }}>
                  <Link href={`/brands/${brandRelation.brand.id}`}>
                    <Typography
                      level="body-sm"
                      sx={{ textDecoration: "underline" }}
                    >
                      {brandRelation.brand.name}
                    </Typography>
                  </Link>
                  <Typography level="body-xs" sx={{ color: "text.secondary" }}>
                    {formatBrandType(brandRelation.brand.brand_type)}
                  </Typography>
                </Box>

                <Chip
                  variant="outlined"
                  color={getBrandTypeColor(brandRelation.brand.brand_type)}
                  size="sm"
                >
                  {formatBrandType(brandRelation.brand.brand_type)}
                </Chip>
              </Stack>
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
};
