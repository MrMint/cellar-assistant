"use client";

import { Breadcrumbs, Link, Typography } from "@mui/joy";
import { usePathname } from "next/navigation";

import { generateBreadcrumbs } from "./breadcrumbs";

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
      {breadcrumbs.map((breadcrumb) => {
        if (!breadcrumb.href) {
          return (
            <Typography key={breadcrumb.label} color="neutral">
              {breadcrumb.label}
            </Typography>
          );
        }

        return (
          <Link
            key={breadcrumb.href}
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
