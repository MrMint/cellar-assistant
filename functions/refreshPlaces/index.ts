import type { Request, Response } from "express";
import { AUTH_ERROR_RESPONSE, validateAuth } from "../_utils/auth-middleware";
import { functionMutation, getAdminAuthHeaders } from "../_utils/urql-client";
import {
  CANCEL_ACTIVE_JOBS_MUTATION,
  CLEAR_PLACES_MUTATION,
  CREATE_JOB_MUTATION,
  type RefreshPlacesResponse,
} from "./_types.js";

export default async (
  req: Request,
  res: Response,
): Promise<Response<RefreshPlacesResponse>> => {
  if (!validateAuth(req)) {
    return res
      .status(401)
      .json(AUTH_ERROR_RESPONSE as unknown as RefreshPlacesResponse);
  }

  try {
    console.log("[PlaceRefresh] Starting place refresh job...");

    // Cancel any in-progress jobs so their queued events become no-ops
    const cancelResult = await functionMutation(
      CANCEL_ACTIVE_JOBS_MUTATION,
      {},
      { headers: getAdminAuthHeaders() },
    );
    const cancelled =
      cancelResult?.update_place_refresh_jobs?.affected_rows ?? 0;
    if (cancelled > 0) {
      console.log(
        `[PlaceRefresh] Cancelled ${cancelled} in-progress job(s)`,
      );
    }

    // Clear existing places
    console.log("[PlaceRefresh] Clearing existing places...");
    await functionMutation(
      CLEAR_PLACES_MUTATION,
      {},
      { headers: getAdminAuthHeaders() },
    );

    // Create job row — Hasura event trigger will pick it up
    const data = await functionMutation(
      CREATE_JOB_MUTATION,
      {},
      { headers: getAdminAuthHeaders() },
    );

    const jobId = data?.insert_place_refresh_jobs_one?.id;
    if (!jobId) {
      throw new Error("Failed to create refresh job");
    }

    console.log(`[PlaceRefresh] Job created: ${jobId}`);

    return res.json({
      success: true,
      job_id: jobId,
      message:
        "Place refresh job started. Batches will process via event triggers.",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[PlaceRefresh] Error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
};
