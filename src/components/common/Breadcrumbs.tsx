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
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;

        if (isLast || !segment.href) {
          return (
            <Typography key={index} color="neutral">
              {segment.label}
            </Typography>
          );
        }

        return (
          <Link
            key={index}
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
