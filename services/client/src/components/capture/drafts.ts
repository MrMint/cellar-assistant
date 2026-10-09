import type { DefaultValuesResult } from "@/components/common/OnboardingWizard/actors/types";
import { createDraftStore } from "@/lib/capture/draft-store";

/**
 * The app's one store of label reads in flight (X05 background
 * continuation): module scope, so it outlives the add page. See
 * `lib/capture/draft-store.ts`.
 */
export const captureDrafts = createDraftStore<DefaultValuesResult>();
