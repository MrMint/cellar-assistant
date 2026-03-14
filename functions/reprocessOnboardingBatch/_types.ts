export interface OnboardingReprocessJob {
  id: string;
  status: "processing" | "completed" | "failed" | "cancelled";
  cursor: string | null;
  filter_ai_model: string | null;
  total_processed: number;
  total_updated: number;
  total_skipped: number;
  total_batches: number;
  error_message: string | null;
}

export interface OnboardingReprocessBatchEventPayload {
  event: {
    data: {
      new: OnboardingReprocessJob;
      old: OnboardingReprocessJob | null;
    };
  };
  table: {
    name: string;
    schema: string;
  };
}
