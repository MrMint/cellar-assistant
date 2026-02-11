/**
 * Event payload from Hasura event trigger on tier_lists table.
 * Fires when content_updated_at changes (triggered by tier_list_items changes).
 */
export interface TierListUpdatedEvent {
  event: {
    data: {
      new: {
        id: string;
        content_updated_at: string;
        insights_generated_at: string | null;
      } | null;
      old: {
        id: string;
        content_updated_at: string;
        insights_generated_at: string | null;
      } | null;
    };
  };
  table: {
    name: string;
    schema: string;
  };
}

export function extractTierListId(input: TierListUpdatedEvent): string {
  const tierListId = input.event.data.new?.id ?? input.event.data.old?.id;

  if (!tierListId) {
    throw new Error("Could not extract tier list id from event payload");
  }

  return tierListId;
}

export function validateEventInput(body: unknown): TierListUpdatedEvent {
  const input = body as TierListUpdatedEvent;

  if (!input?.event?.data) {
    throw new Error("Invalid event payload: missing event.data");
  }

  if (!input.event.data.new && !input.event.data.old) {
    throw new Error(
      "Invalid event payload: both event.data.new and event.data.old are null",
    );
  }

  return input;
}
