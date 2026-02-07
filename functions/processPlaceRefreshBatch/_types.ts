export interface PlaceRefreshJob {
  id: string;
  status: string;
  cursor: string | null;
  total_inserted: number;
  total_batches: number;
  error_message: string | null;
}

export interface PlaceRefreshBatchEventPayload {
  event: {
    data: {
      new: PlaceRefreshJob;
      old: PlaceRefreshJob | null;
    };
  };
  table: {
    name: string;
    schema: string;
  };
}
