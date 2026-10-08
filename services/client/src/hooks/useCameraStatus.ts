"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import {
  CAMERA_START_TIMEOUT_MS,
  cameraStatusReducer,
  initialCameraStatus,
} from "@/lib/camera/camera-status";

/**
 * N04: a camera's state with the start timeout attached. `attempt` changes on
 * every retry — key the camera element on it so "Try again" asks for the
 * stream afresh rather than waiting on the request that already hung.
 */
export const useCameraStatus = (timeoutMs = CAMERA_START_TIMEOUT_MS) => {
  const [status, dispatch] = useReducer(
    cameraStatusReducer,
    initialCameraStatus,
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (status.kind !== "starting") return;
    const timer = setTimeout(() => dispatch({ type: "timeout" }), timeoutMs);
    return () => clearTimeout(timer);
  }, [status.kind, timeoutMs]);

  const onStream = useCallback(() => dispatch({ type: "stream" }), []);
  const onError = useCallback(
    (error: unknown) => dispatch({ type: "error", error }),
    [],
  );
  const retry = useCallback(() => {
    dispatch({ type: "retry" });
    setAttempt((n) => n + 1);
  }, []);

  return { status, attempt, onStream, onError, retry };
};
