import { Link, Breadcrumbs as MuiBreadcrumbs, Typography } from "@mui/joy";

interface BreadcrumbSegment {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  segments: BreadcrumbSegment[];
}

export function Breadcrumbs({ segments }: BreadcrumbsProps) {
  return (
    <MuiBreadcrumbs
      sx={{
        mb: 2,
        px: 0,
      }}
    >
      {segments.map((segment) => {
        if (!segment.href) {
          return (
            <Typography key={segment.label} color="neutral">
              {segment.label}
            </Typography>
          );
        }

        return (
          <Link
            key={segment.href}
            href={segment.href}
            color="neutral"
            underline="hover"
          >
            {segment.label}
          </Link>
        );
      })}
    </MuiBreadcrumbs>
  );
}
