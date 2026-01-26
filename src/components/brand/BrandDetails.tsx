"use client";

import {
  AspectRatio,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Stack,
  Typography,
} from "@mui/joy";
import Image from "next/image";
import { isNotNil } from "ramda";
import { MdBusiness, MdLocalBar, MdLocationOn } from "react-icons/md";
import { Link } from "@/components/common/Link";
import cellar1 from "@/images/cellar1.png";

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

export type BrandItem = {
  id: string;
  is_primary?: boolean;
  wine_id?: string | null;
  beer_id?: string | null;
  spirit_id?: string | null;
  coffee_id?: string | null;
  wine?: { id: string; name: string; vintage?: string | null } | null;
  beer?: { id: string; name: string } | null;
  spirit?: { id: string; name: string } | null;
  coffee?: { id: string; name: string } | null;
};

export type BrandPlace = {
  id: string;
  relationship_type: string;
  place: {
    id: string;
    name: string;
    latitude?: number | null;
    longitude?: number | null;
  };
};

export type BrandDetailsItem = {
  id: string;
  name: string;
  description?: string | null;
  logo_url?: string | null;
  brand_type: string;
  parent_brand_id?: string | null;
  created_at: string;
  parent_brand?: {
    id: string;
    name: string;
    brand_type: string;
  } | null;
  child_brands?: {
    id: string;
    name: string;
    brand_type: string;
  }[];
  item_brands: BrandItem[];
  place_brands: BrandPlace[];
};

export type BrandDetailsProps = {
  brand: BrandDetailsItem;
};

const getItemDisplay = (item: BrandItem) => {
  if (isNotNil(item.wine)) {
    const vintage = item.wine.vintage ? `${item.wine.vintage} ` : "";
    return {
      name: `${vintage}${item.wine.name}`,
      type: "wine" as const,
      itemId: item.wine.id,
      href: `/wines/${item.wine.id}`,
    };
  }

  if (isNotNil(item.beer)) {
    return {
      name: item.beer.name,
      type: "beer" as const,
      itemId: item.beer.id,
      href: `/beers/${item.beer.id}`,
    };
  }

  if (isNotNil(item.spirit)) {
    return {
      name: item.spirit.name,
      type: "spirit" as const,
      itemId: item.spirit.id,
      href: `/spirits/${item.spirit.id}`,
    };
  }

  if (isNotNil(item.coffee)) {
    return {
      name: item.coffee.name,
      type: "coffee" as const,
      itemId: item.coffee.id,
      href: `/coffees/${item.coffee.id}`,
    };
  }

  return null;
};

const formatRelationshipType = (type: string) => {
  return type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
};

export const BrandDetails = ({ brand }: BrandDetailsProps) => {
  const groupedItems = brand.item_brands.reduce(
    (acc, item) => {
      const display = getItemDisplay(item);
      if (display) {
        if (!acc[display.type]) {
          acc[display.type] = [];
        }
        acc[display.type].push({ ...display, isPrimary: item.is_primary });
      }
      return acc;
    },
    {} as Record<
      string,
      Array<{
        name: string;
        type: string;
        itemId: string;
        href: string;
        isPrimary?: boolean;
      }>
    >,
  );

  return (
    <Stack spacing={3}>
      {/* Brand Header */}
      <Card>
        <Grid container spacing={2}>
          <Grid xs={12} md={4}>
            <AspectRatio ratio="1">
              {isNotNil(brand.logo_url) ? (
                <Image
                  src={brand.logo_url}
                  alt={`${brand.name} logo`}
                  fill
                  style={{ objectFit: "contain" }}
                />
              ) : (
                <Image
                  src={cellar1}
                  alt={`${brand.name} placeholder`}
                  fill
                  style={{ objectFit: "contain" }}
                />
              )}
            </AspectRatio>
          </Grid>
          <Grid xs={12} md={8}>
            <CardContent>
              <Stack spacing={2}>
                <Box>
                  <Typography level="h2" component="h1">
                    {brand.name}
                  </Typography>
                  <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                    Since {new Date(brand.created_at).getFullYear()}
                  </Typography>
                </Box>

                {isNotNil(brand.description) && (
                  <Typography level="body-md">{brand.description}</Typography>
                )}

                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Chip
                    variant="soft"
                    color={getBrandTypeColor(brand.brand_type)}
                    startDecorator={getBrandTypeIcon(brand.brand_type)}
                  >
                    {formatBrandType(brand.brand_type)}
                  </Chip>
                </Stack>

                {/* Brand hierarchy */}
                {isNotNil(brand.parent_brand) && (
                  <Box>
                    <Typography
                      level="body-sm"
                      sx={{ color: "text.secondary" }}
                    >
                      Part of:{" "}
                      <Link href={`/brands/${brand.parent_brand.id}`}>
                        <Typography
                          component="span"
                          level="body-sm"
                          fontWeight="md"
                          sx={{ textDecoration: "underline" }}
                        >
                          {brand.parent_brand.name}
                        </Typography>
                      </Link>
                    </Typography>
                  </Box>
                )}

                {isNotNil(brand.child_brands) &&
                  brand.child_brands.length > 0 && (
                    <Box>
                      <Typography
                        level="body-sm"
                        sx={{ color: "text.secondary", mb: 1 }}
                      >
                        Owns brands:
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap">
                        {brand.child_brands.map((child) => (
                          <Link key={child.id} href={`/brands/${child.id}`}>
                            <Chip
                              variant="outlined"
                              size="sm"
                              sx={{ cursor: "pointer" }}
                            >
                              {child.name}
                            </Chip>
                          </Link>
                        ))}
                      </Stack>
                    </Box>
                  )}
              </Stack>
            </CardContent>
          </Grid>
        </Grid>
      </Card>

      {/* Items and Places */}
      <Grid container spacing={3}>
        {/* Associated Items */}
        <Grid xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography level="h3" component="h2" sx={{ mb: 2 }}>
                Associated Items ({brand.item_brands.length})
              </Typography>

              {Object.keys(groupedItems).length === 0 ? (
                <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                  No items associated with this brand yet.
                </Typography>
              ) : (
                <Stack spacing={3}>
                  {Object.entries(groupedItems).map(([type, items]) => (
                    <Box key={type}>
                      <Typography
                        level="title-sm"
                        sx={{
                          mb: 1,
                          textTransform: "capitalize",
                          fontWeight: "md",
                        }}
                      >
                        {type}s ({items.length})
                      </Typography>
                      <Stack spacing={1}>
                        {items.map((item) => (
                          <Box key={item.itemId}>
                            <Stack
                              direction="row"
                              spacing={1}
                              alignItems="center"
                            >
                              <Link href={item.href}>
                                <Typography
                                  level="body-sm"
                                  sx={{ textDecoration: "underline" }}
                                >
                                  {item.name}
                                </Typography>
                              </Link>
                              {item.isPrimary && (
                                <Chip variant="soft" size="sm" color="primary">
                                  Primary
                                </Chip>
                              )}
                            </Stack>
                          </Box>
                        ))}
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Associated Places */}
        <Grid xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography level="h3" component="h2" sx={{ mb: 2 }}>
                Associated Places ({brand.place_brands.length})
              </Typography>

              {brand.place_brands.length === 0 ? (
                <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                  No places associated with this brand yet.
                </Typography>
              ) : (
                <Stack spacing={2}>
                  {brand.place_brands.map((placeRelation) => (
                    <Box key={placeRelation.id}>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Box sx={{ flex: 1 }}>
                          <Link href={`/places/${placeRelation.place.id}`}>
                            <Typography
                              level="body-md"
                              sx={{ textDecoration: "underline" }}
                            >
                              {placeRelation.place.name}
                            </Typography>
                          </Link>
                          <Typography
                            level="body-sm"
                            sx={{ color: "text.secondary" }}
                          >
                            {formatRelationshipType(
                              placeRelation.relationship_type,
                            )}
                          </Typography>
                        </Box>
                        <MdLocationOn
                          style={{ color: "var(--joy-palette-neutral-500)" }}
                        />
                      </Stack>
                      {placeRelation !==
                        brand.place_brands[brand.place_brands.length - 1] && (
                        <Divider sx={{ my: 1 }} />
                      )}
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
};
