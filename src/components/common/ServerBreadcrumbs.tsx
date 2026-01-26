"use client";

import { Breadcrumbs, Link, Typography } from "@mui/joy";
import { usePathname } from "next/navigation";

interface BreadcrumbSegment {
  label: string;
  href?: string;
}

function generateBreadcrumbs(
  pathname: string,
  cellarName?: string,
  itemName?: string,
  recipeName?: string,
): BreadcrumbSegment[] {
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs: BreadcrumbSegment[] = [{ label: "Home", href: "/" }];

  if (segments.length === 0) return breadcrumbs;

  // Handle authenticated routes (skip the "(authenticated)" segment)
  let segmentIndex = 0;
  if (segments[0] === "(authenticated)") {
    segmentIndex = 1;
  }

  for (let i = segmentIndex; i < segments.length; i++) {
    const segment = segments[i];
    const isLast = i === segments.length - 1;

    // Build href up to current segment
    const href = `/${segments.slice(segmentIndex, i + 1).join("/")}`;

    if (segment === "cellars") {
      breadcrumbs.push({ label: "Cellars", href: isLast ? undefined : href });
    } else if (
      segment.match(/^[0-9a-f-]{36}$/i) &&
      segments[i - 1] === "cellars"
    ) {
      // Cellar ID
      const label = cellarName || "Cellar";
      breadcrumbs.push({ label, href: isLast ? undefined : href });
    } else if (["beers", "wines", "spirits", "coffees"].includes(segment)) {
      // Check if this is a cellar item path (cellars/{id}/spirits/{id}) vs standalone item path (spirits/{id})
      const isCellarItemPath = segments.some(
        (s, idx) => s === "cellars" && idx < i,
      );

      if (!isCellarItemPath) {
        // Only add item type breadcrumb for standalone item pages, not cellar item pages
        const label = segment.charAt(0).toUpperCase() + segment.slice(1);
        breadcrumbs.push({ label, href: isLast ? undefined : href });
      }
    } else if (
      segment.match(/^[0-9a-f-]{36}$/i) &&
      ["beers", "wines", "spirits", "coffees"].includes(segments[i - 1])
    ) {
      // Item ID
      const label = itemName || "Item";
      breadcrumbs.push({ label, href: isLast ? undefined : href });
    } else if (segment === "edit") {
      breadcrumbs.push({ label: "Edit" });
    } else if (segment === "add") {
      breadcrumbs.push({ label: "Add" });
    } else if (segment === "favorites") {
      breadcrumbs.push({ label: "Favorites", href: isLast ? undefined : href });
    } else if (segment === "friends") {
      breadcrumbs.push({ label: "Friends", href: isLast ? undefined : href });
    } else if (segment === "rankings") {
      breadcrumbs.push({ label: "Rankings", href: isLast ? undefined : href });
    } else if (segment === "search") {
      breadcrumbs.push({ label: "Search", href: isLast ? undefined : href });
    } else if (segment === "recipes") {
      breadcrumbs.push({ label: "Recipes", href: isLast ? undefined : href });
    } else if (
      segment.match(/^[0-9a-f-]{36}$/i) &&
      segments[i - 1] === "recipes"
    ) {
      // Recipe ID
      const label = recipeName || "Recipe";
      breadcrumbs.push({ label, href: isLast ? undefined : href });
    } else if (segment === "users") {
      breadcrumbs.push({ label: "Profile", href: isLast ? undefined : href });
    } else if (!segment.match(/^[0-9a-f-]{36}$/i)) {
      // Non-UUID segments that aren't recognized
      const label = segment.charAt(0).toUpperCase() + segment.slice(1);
      breadcrumbs.push({ label, href: isLast ? undefined : href });
    }
  }

  return breadcrumbs;
}

interface ServerBreadcrumbsProps {
  cellarName?: string;
  itemName?: string;
  recipeName?: string;
}

export function ServerBreadcrumbs({
  cellarName,
  itemName,
  recipeName,
}: ServerBreadcrumbsProps = {}) {
  const pathname = usePathname();
  const breadcrumbs = generateBreadcrumbs(
    pathname,
    cellarName,
    itemName,
    recipeName,
  );

  return (
    <Breadcrumbs
      sx={{
        px: 0,
      }}
    >
      {breadcrumbs.map((breadcrumb, index) => {
        const isLast = index === breadcrumbs.length - 1;

        if (isLast || !breadcrumb.href) {
          return (
            <Typography key={index} color="neutral">
              {breadcrumb.label}
            </Typography>
          );
        }

        return (
          <Link
            key={index}
            href={breadcrumb.href}
            color="neutral"
            underline="hover"
          >
            {breadcrumb.label}
          </Link>
        );
      })}
    </Breadcrumbs>
  );
}
