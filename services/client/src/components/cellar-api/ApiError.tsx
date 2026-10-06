"use client";

import { Alert, Typography } from "@mui/joy";
import { MdErrorOutline } from "react-icons/md";
import type { ApiFailure } from "@/lib/api/result";

/**
 * One of the five typed errors, rendered.
 *
 * `message` comes from the actor and is written for a person; `code` is the
 * stable half and is only shown for the ones a viewer can act on. A
 * `NotFoundError` should generally not reach here — §1.6 makes it mean "no such
 * thing, or not yours", and pages render that as an empty state instead.
 */
export function ApiError({
  error,
  title,
}: {
  error: ApiFailure;
  title?: string;
}) {
  return (
    <Alert
      color={error.code === "FORBIDDEN" ? "warning" : "danger"}
      variant="soft"
      startDecorator={<MdErrorOutline />}
      sx={{ alignItems: "flex-start" }}
    >
      <div>
        {title !== undefined && (
          <Typography level="title-sm">{title}</Typography>
        )}
        <Typography level="body-sm">{error.message}</Typography>
      </div>
    </Alert>
  );
}
