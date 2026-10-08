"use client";

/**
 * `82450ad1:src/components/map/places/CreatePlaceForm.tsx`, restored —
 * `/map/create-place?lat=…&lng=…` (the map's centre pin).
 *
 * - Reverse geocode, Google nearby suggestions, Google autocomplete and the
 *   debounced duplicate check run as before, through `usePlaceActions`.
 * - Picking a Google suggestion pre-fills what the suggestion carries (its
 *   name, and categories from its types) at once, then — as the old form's
 *   `enrich_place_from_google({ googlePlaceId })` did — asks for the
 *   listing's details before the place exists (`googlePlaceDetails`, G21)
 *   and fills name, phone, website and description from them, with the old
 *   "Fetching place details..." chip and the search disabled while it runs.
 *   A failure or a budget denial leaves the form as it was, usable. Only the
 *   latest pick's answer lands. The place is still bound to that listing
 *   right after it is created (`enrichPlaceFromGoogle(placeId,
 *   { googlePlaceId })`), which stores the full enrichment and photos.
 * - `createPlace` gets a client-minted `placeId`, minted once per form and
 *   reused on every retry (N09), so a retried submit is idempotent; it does
 *   the rate limit and duplicate re-check server-side — closed, where the old
 *   action failed open.
 * - X27 / D28: the place is saved at once as PENDING — the toast says only
 *   the creator can see it until it has been checked — and the AI review
 *   runs afterwards. The same form, given `edit`, is the "Edit & resubmit"
 *   screen for a pending or rejected place (`/places/[placeId]/edit`): no
 *   pin geocode or Google suggestions, the place's own values, the reviewer's
 *   reason on top, and `resubmitPlace` on save.
 */

import type { CountryCode } from "libphonenumber-js";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { Controller, type SubmitHandler, useForm } from "react-hook-form";
import {
  isSupportedCountry,
  isValidPhoneNumber,
} from "react-phone-number-input";
import PhoneInput from "react-phone-number-input/input";
import { AIDraftField } from "@/components/app/AIDraftField";
import { IconButton } from "@/components/app/IconButton";
import { Back, MyLocation } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { isDrafted } from "@/lib/forms/ai-draft";
import {
  type CreatePlaceInput,
  type DuplicatePlace,
  type GoogleAutocompleteSuggestion,
  type GoogleNearbyPlace,
  usePlaceActions,
} from "../actions";
import {
  googlePrefillFields,
  type PinAddressField,
  pinAddressDraft,
  pinAddressNotFound,
} from "../adapter";
import {
  CategoryMultiSelect,
  type CategoryOption,
} from "./CategoryMultiSelect";
import { DuplicatePlaceCheck } from "./DuplicatePlaceCheck";
import { GooglePlaceSearch } from "./GooglePlaceSearch";
import { GooglePlaceSuggestions } from "./GooglePlaceSuggestions";
import {
  formatCategoryLabel,
  PLACE_CATEGORY_TIERS,
  type UserPlaceCategory,
} from "./userPlaceCategories";

// =============================================================================
// Category Options
// =============================================================================

const CATEGORY_OPTIONS: CategoryOption<UserPlaceCategory>[] = [
  ...PLACE_CATEGORY_TIERS.venues.map((value) => ({
    label: formatCategoryLabel(value),
    value,
    tier: "Venues",
  })),
  ...PLACE_CATEGORY_TIERS.retail.map((value) => ({
    label: formatCategoryLabel(value),
    value,
    tier: "Retail",
  })),
];

const WEBSITE_PROTOCOL_RE = /^https?:\/\//i;

function normalizeWebsite(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidate = WEBSITE_PROTOCOL_RE.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !parsed.hostname.includes(".")
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function toSupportedCountryCode(value: string): CountryCode | undefined {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return undefined;
  if (!isSupportedCountry(normalized)) return undefined;
  return normalized as CountryCode;
}

// =============================================================================
// Form Types
// =============================================================================

interface FormFields {
  name: string;
  categories: CategoryOption<UserPlaceCategory>[];
  street_address: string;
  locality: string;
  region: string;
  postcode: string;
  country_code: string;
  phone: string;
  website: string;
  description: string;
}

/** X27: what the form needs to edit a place under review and resubmit it. */
export interface PlaceEditTarget {
  placeId: string;
  reviewStatus: "PENDING" | "REJECTED";
  rejectionReason: string | null;
  values: {
    name: string;
    categories: readonly string[];
    street_address: string;
    locality: string;
    region: string;
    postcode: string;
    country_code: string;
    phone: string;
    website: string;
    description: string;
  };
}

interface CreatePlaceFormProps {
  latitude: number;
  longitude: number;
  /** N22: the name searched for when "Add it here" started this. */
  initialName?: string;
  /** X27: edit this place under review instead of creating one. */
  edit?: PlaceEditTarget;
}

/**
 * The category options a place's stored categories select. A category
 * outside the form's list (one a place came with) is kept as an option of
 * its own rather than silently dropped on resubmit.
 */
function categoryOptionsFor(
  categories: readonly string[],
): CategoryOption<UserPlaceCategory>[] {
  return categories.map(
    (value) =>
      CATEGORY_OPTIONS.find((option) => option.value === value) ?? {
        label: formatCategoryLabel(value),
        value: value as UserPlaceCategory,
        tier: "Other",
      },
  );
}

// =============================================================================
// Component
// =============================================================================

export function CreatePlaceForm({
  latitude,
  longitude,
  initialName = "",
  edit,
}: CreatePlaceFormProps) {
  const editing = edit !== undefined;
  const router = useRouter();
  const fieldId = useId();
  const idOf = (name: keyof FormFields) => `${fieldId}-${name}`;
  /**
   * The error line's id when that field has one, for `aria-describedby` —
   * what Joy's FormControl wired up on its own.
   */
  const errorOf = (name: keyof FormFields) =>
    errors[name] ? `${fieldId}-${name}-error` : undefined;
  const {
    checkDuplicatePlacesAction,
    googlePlaceDetailsAction,
    createUserPlaceAction,
    resubmitPlaceAction,
    googleNearbySearchAction,
    reverseGeocodeAction,
  } = usePlaceActions();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicatePlace[]>([]);
  const [duplicatesConfirmed, setDuplicatesConfirmed] = useState(false);
  const [addressLoading, setAddressLoading] = useState(!editing);
  /** What the pin's reverse geocode filled in — the "From pin" marks' draft. */
  const [pinDraft, setPinDraft] = useState<
    Partial<Record<PinAddressField, string>>
  >({});
  const duplicateCheckTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Google Places state
  const [googlePlaces, setGooglePlaces] = useState<GoogleNearbyPlace[]>([]);
  const [googlePlacesLoading, setGooglePlacesLoading] = useState(!editing);
  // Editing starts from the place's own values; there is no listing to pick.
  const [googlePlacesDismissed, setGooglePlacesDismissed] = useState(editing);
  const [selectedGooglePlaceId, setSelectedGooglePlaceId] = useState<
    string | null
  >(null);
  const [enriching, setEnriching] = useState(false);
  /** Which pick's details may still land — a later pick retires earlier ones. */
  const prefillRequest = useRef(0);
  /**
   * N09: one idempotency key for this creation, however many times Save is
   * tapped. A retry after a slow or failed-looking first attempt is then the
   * same creation — the server returns the row the first attempt wrote
   * instead of refusing the retry as a duplicate of it.
   */
  const [creationId] = useState(() => crypto.randomUUID());

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting, errors },
  } = useForm<FormFields>({
    defaultValues: edit
      ? {
          ...edit.values,
          categories: categoryOptionsFor(edit.values.categories),
        }
      : {
          name: initialName,
          categories: [],
          street_address: "",
          locality: "",
          region: "",
          postcode: "",
          country_code: "",
          phone: "",
          website: "",
          description: "",
        },
  });

  const nameValue = watch("name");
  const fromPin = (field: PinAddressField): boolean =>
    isDrafted(pinDraft[field], watch(field));
  const countryCodeValue = watch("country_code");
  const phoneCountry = toSupportedCountryCode(countryCodeValue) ?? "US";

  // Auto-fill address from reverse geocode + fetch Google nearby places on
  // mount — a new place only: an edit starts from the place's own values.
  useEffect(() => {
    if (editing) return;
    let cancelled = false;

    setAddressLoading(true);
    reverseGeocodeAction(latitude, longitude)
      .then((result) => {
        if (cancelled) return;
        const draft = pinAddressDraft(result);
        for (const [key, value] of Object.entries(draft)) {
          setValue(key as PinAddressField, value);
        }
        setPinDraft(draft);
      })
      .finally(() => {
        if (!cancelled) setAddressLoading(false);
      });

    // Fetch nearby Google places in parallel
    setGooglePlacesLoading(true);
    googleNearbySearchAction(latitude, longitude)
      .then((result) => {
        if (!cancelled) setGooglePlaces(result.places);
      })
      .catch(() => {
        // Silently fail — user can still fill form manually
      })
      .finally(() => {
        if (!cancelled) setGooglePlacesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    editing,
    latitude,
    longitude,
    setValue,
    reverseGeocodeAction,
    googleNearbySearchAction,
  ]);

  // Debounced duplicate check on name change
  useEffect(() => {
    if (duplicateCheckTimer.current) {
      clearTimeout(duplicateCheckTimer.current);
    }

    const trimmed = nameValue.trim();
    if (trimmed.length < 3) {
      setDuplicates([]);
      setDuplicatesConfirmed(false);
      return;
    }

    duplicateCheckTimer.current = setTimeout(async () => {
      try {
        const { duplicates: checked } = await checkDuplicatePlacesAction(
          trimmed,
          latitude,
          longitude,
        );
        // An edited place is never a duplicate of itself.
        const found = checked.filter((d) => d.id !== edit?.placeId);
        setDuplicates(found);
        if (found.length === 0) {
          setDuplicatesConfirmed(true);
        } else {
          setDuplicatesConfirmed(false);
        }
      } catch {
        // Silently ignore duplicate check errors
        setDuplicatesConfirmed(true);
      }
    }, 500);

    return () => {
      if (duplicateCheckTimer.current) {
        clearTimeout(duplicateCheckTimer.current);
      }
    };
  }, [nameValue, latitude, longitude, checkDuplicatePlacesAction, edit]);

  const handleSelectExisting = useCallback(
    (placeId: string) => {
      router.push(`/map?placeId=${placeId}`);
    },
    [router],
  );

  const handleConfirmNew = useCallback(() => {
    setDuplicatesConfirmed(true);
  }, []);

  // Map Google types to our category options
  const prefillCategories = useCallback(
    (types: readonly string[]) => {
      const matchedCategories = CATEGORY_OPTIONS.filter((cat) =>
        types.some(
          (t) =>
            t === cat.value || t.replace(/_/g, " ") === cat.label.toLowerCase(),
        ),
      );
      if (matchedCategories.length > 0) {
        setValue("categories", matchedCategories, { shouldDirty: true });
      }
    },
    [setValue],
  );

  // Pre-fill the form from a Google suggestion: what the suggestion carries
  // at once, then the listing's details (G21) — the old `prefillFromGoogle`.
  const prefillFromGoogle = useCallback(
    async (suggestion: {
      googlePlaceId: string;
      name: string;
      types: string[];
    }) => {
      setValue("name", suggestion.name, { shouldDirty: true });
      prefillCategories(suggestion.types);
      setSelectedGooglePlaceId(suggestion.googlePlaceId);

      prefillRequest.current += 1;
      const request = prefillRequest.current;
      setEnriching(true);
      try {
        const { details } = await googlePlaceDetailsAction(
          suggestion.googlePlaceId,
        );
        // A later pick owns the form now; this answer is stale.
        if (request !== prefillRequest.current || details === null) return;
        const fields = googlePrefillFields(details, isValidPhoneNumber);
        if (fields.name) setValue("name", fields.name, { shouldDirty: true });
        if (fields.phone) {
          setValue("phone", fields.phone, { shouldDirty: true });
        }
        if (fields.website) {
          setValue("website", fields.website, { shouldDirty: true });
        }
        if (fields.description) {
          setValue("description", fields.description, { shouldDirty: true });
        }
        prefillCategories(details.types);
      } finally {
        if (request === prefillRequest.current) setEnriching(false);
      }
    },
    [setValue, prefillCategories, googlePlaceDetailsAction],
  );

  const handleGooglePlaceSelect = useCallback(
    (place: GoogleNearbyPlace) => {
      setGooglePlacesDismissed(true);
      void prefillFromGoogle(place);
    },
    [prefillFromGoogle],
  );

  const handleGoogleAutocompleteSuggestionSelect = useCallback(
    (suggestion: GoogleAutocompleteSuggestion) => {
      void prefillFromGoogle(suggestion);
    },
    [prefillFromGoogle],
  );

  const handleGoogleDismiss = useCallback(() => {
    setGooglePlacesDismissed(true);
  }, []);

  const onSubmit: SubmitHandler<FormFields> = async (data) => {
    setServerError(null);
    const normalizedWebsite = normalizeWebsite(data.website);

    const input: CreatePlaceInput = {
      name: data.name,
      categories: data.categories.map((c) => c.value),
      latitude,
      longitude,
      street_address: data.street_address || undefined,
      locality: data.locality || undefined,
      region: data.region || undefined,
      postcode: data.postcode || undefined,
      country_code: data.country_code.trim().toUpperCase() || undefined,
      phone:
        data.phone && isValidPhoneNumber(data.phone) ? data.phone : undefined,
      website: normalizedWebsite ?? undefined,
      description: data.description || undefined,
      google_place_id: selectedGooglePlaceId ?? undefined,
      placeId: creationId,
    };

    startTransition(async () => {
      if (edit) {
        const { google_place_id: _none, placeId: _id, ...fields } = input;
        const result = await resubmitPlaceAction(edit.placeId, fields);
        if (result.success) {
          notify("Sent for review again", {
            tone: "success",
            description: "Only you can see it until it's been checked.",
          });
          router.push(`/places/${edit.placeId}`);
        } else {
          setServerError(result.error ?? "Something went wrong.");
        }
        return;
      }

      const result = await createUserPlaceAction(input);

      if (result.success && result.placeId) {
        // X27 / D28: saved now, shared once the review approves it.
        notify(`Saved ${input.name.trim()}`, {
          tone: "success",
          description:
            result.reviewStatus === "APPROVED"
              ? undefined
              : "Only you can see it until it's been checked.",
        });
        router.push(`/map?placeId=${result.placeId}`);
      } else {
        setServerError(result.error ?? "Something went wrong.");
        if (result.duplicates?.length) {
          setDuplicates(result.duplicates);
          setDuplicatesConfirmed(false);
        }
      }
    });
  };

  const loading = isSubmitting || isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="flex flex-col gap-5">
        {/* Back button + location preview */}
        <div className="flex flex-row items-center gap-2">
          <IconButton
            aria-label={editing ? "Back to place" : "Back to map"}
            variant="outline"
            size="sm"
            onClick={() =>
              router.push(edit ? `/places/${edit.placeId}` : "/map")
            }
          >
            <Back />
          </IconButton>
          <Badge variant="secondary" className="tabular">
            <MyLocation aria-hidden />
            {latitude.toFixed(5)}, {longitude.toFixed(5)}
          </Badge>
        </div>

        {/* X27: why a rejected place was refused, above the fields to fix */}
        {edit?.reviewStatus === "REJECTED" && (
          <Alert data-testid="edit-rejection-reason">
            <AlertTitle>Why it wasn't approved</AlertTitle>
            <AlertDescription>
              {edit.rejectionReason?.trim() ||
                "This place couldn't be confirmed as a real venue."}
            </AlertDescription>
          </Alert>
        )}

        {/* Google Places suggestions */}
        {!googlePlacesDismissed && (
          <GooglePlaceSuggestions
            places={googlePlaces}
            loading={googlePlacesLoading}
            onSelect={handleGooglePlaceSelect}
            onDismiss={handleGoogleDismiss}
          />
        )}

        {/* Google autocomplete search (shown after suggestions dismissed) */}
        {!editing && googlePlacesDismissed && !selectedGooglePlaceId && (
          <GooglePlaceSearch
            latitude={latitude}
            longitude={longitude}
            onSelect={handleGoogleAutocompleteSuggestionSelect}
            disabled={enriching}
          />
        )}

        {/* Pre-filled indicator */}
        {selectedGooglePlaceId && (
          <Badge variant="secondary" className="text-success">
            Pre-filled from Google
          </Badge>
        )}

        {/* Enriching indicator */}
        {enriching && (
          <Badge variant="secondary">
            <Spinner />
            Fetching place details...
          </Badge>
        )}

        {/* Duplicate check */}
        <DuplicatePlaceCheck
          duplicates={duplicates}
          onSelectExisting={handleSelectExisting}
          onConfirmNew={handleConfirmNew}
        />

        {/* Server error */}
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        {/* Name */}
        <Controller
          name="name"
          control={control}
          rules={{
            required: "Place name is required",
            maxLength: {
              value: 200,
              message: "Name must be under 200 characters",
            },
          }}
          render={({ field }) => (
            <Field data-invalid={!!errors.name || undefined}>
              <FieldLabel htmlFor={idOf("name")}>Name *</FieldLabel>
              <Input
                {...field}
                id={idOf("name")}
                aria-invalid={!!errors.name || undefined}
                aria-describedby={errorOf("name")}
                placeholder="e.g. The Rusty Barrel"
              />
              {errors.name && (
                <FieldError id={errorOf("name")}>
                  {errors.name.message}
                </FieldError>
              )}
            </Field>
          )}
        />

        {/* Categories */}
        <Controller
          name="categories"
          control={control}
          rules={{
            validate: (v) => v.length > 0 || "Select at least one category",
          }}
          render={({ field }) => (
            <Field data-invalid={!!errors.categories || undefined}>
              <FieldLabel htmlFor={idOf("categories")}>Categories *</FieldLabel>
              <CategoryMultiSelect
                id={idOf("categories")}
                options={CATEGORY_OPTIONS}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                invalid={!!errors.categories}
                describedBy={errorOf("categories")}
                placeholder="Select categories..."
              />
              {errors.categories && (
                <FieldError id={errorOf("categories")}>
                  {errors.categories.message}
                </FieldError>
              )}
            </Field>
          )}
        />

        <Separator />

        {/* Address section */}
        <div className="flex flex-row items-center gap-2">
          <h2 className="type-callout font-semibold text-ink-1">Address</h2>
          {addressLoading && (
            <Badge variant="secondary">
              <Spinner />
              Loading address...
            </Badge>
          )}
        </div>
        {pinAddressNotFound(addressLoading, pinDraft) && (
          <p className="type-footnote">
            Couldn't find an address for this pin. Add it below if you know it.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Controller
            name="street_address"
            control={control}
            render={({ field }) => (
              <AIDraftField
                source="pin"
                drafted={fromPin("street_address")}
                className="sm:col-span-2"
              >
                <Field>
                  <FieldLabel htmlFor={idOf("street_address")}>
                    Street Address
                  </FieldLabel>
                  <Input
                    {...field}
                    id={idOf("street_address")}
                    placeholder="123 Main St"
                  />
                </Field>
              </AIDraftField>
            )}
          />

          <Controller
            name="locality"
            control={control}
            render={({ field }) => (
              <AIDraftField source="pin" drafted={fromPin("locality")}>
                <Field>
                  <FieldLabel htmlFor={idOf("locality")}>City</FieldLabel>
                  <Input {...field} id={idOf("locality")} placeholder="City" />
                </Field>
              </AIDraftField>
            )}
          />

          <Controller
            name="region"
            control={control}
            render={({ field }) => (
              <AIDraftField source="pin" drafted={fromPin("region")}>
                <Field>
                  <FieldLabel htmlFor={idOf("region")}>State/Region</FieldLabel>
                  <Input {...field} id={idOf("region")} placeholder="State" />
                </Field>
              </AIDraftField>
            )}
          />

          <Controller
            name="postcode"
            control={control}
            render={({ field }) => (
              <AIDraftField source="pin" drafted={fromPin("postcode")}>
                <Field>
                  <FieldLabel htmlFor={idOf("postcode")}>
                    Postal Code
                  </FieldLabel>
                  <Input {...field} id={idOf("postcode")} placeholder="12345" />
                </Field>
              </AIDraftField>
            )}
          />

          <Controller
            name="country_code"
            control={control}
            rules={{
              validate: (value) => {
                const trimmed = value.trim();
                if (!trimmed) return true;
                return (
                  toSupportedCountryCode(trimmed) != null ||
                  "Use a valid 2-letter country code"
                );
              },
            }}
            render={({ field }) => (
              <AIDraftField source="pin" drafted={fromPin("country_code")}>
                <Field data-invalid={!!errors.country_code || undefined}>
                  <FieldLabel htmlFor={idOf("country_code")}>
                    Country Code
                  </FieldLabel>
                  <Input
                    {...field}
                    id={idOf("country_code")}
                    aria-invalid={!!errors.country_code || undefined}
                    aria-describedby={errorOf("country_code")}
                    value={field.value}
                    onChange={(event) =>
                      field.onChange(
                        event.target.value.toUpperCase().slice(0, 2),
                      )
                    }
                    placeholder="US"
                  />
                  {errors.country_code && (
                    <FieldError id={errorOf("country_code")}>
                      {errors.country_code.message}
                    </FieldError>
                  )}
                </Field>
              </AIDraftField>
            )}
          />
        </div>

        <Separator />

        {/* Contact info */}
        <h2 className="type-callout font-semibold text-ink-1">
          Contact (optional)
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Controller
            name="phone"
            control={control}
            rules={{
              validate: (value) => {
                if (!value || value.replace(/\D/g, "").length <= 3) return true;
                return (
                  isValidPhoneNumber(value) || "Enter a valid phone number"
                );
              },
            }}
            render={({ field }) => (
              <Field data-invalid={!!errors.phone || undefined}>
                <FieldLabel htmlFor={idOf("phone")}>Phone</FieldLabel>
                <PhoneInput
                  id={idOf("phone")}
                  inputComponent={Input}
                  aria-invalid={!!errors.phone || undefined}
                  aria-describedby={errorOf("phone")}
                  country={phoneCountry}
                  international
                  withCountryCallingCode
                  value={field.value || undefined}
                  onChange={(value) => field.onChange(value ?? "")}
                  onBlur={field.onBlur}
                  name={field.name}
                  placeholder="+1 555 123 4567"
                />
                {errors.phone && (
                  <FieldError id={errorOf("phone")}>
                    {errors.phone.message}
                  </FieldError>
                )}
              </Field>
            )}
          />

          <Controller
            name="website"
            control={control}
            rules={{
              validate: (value) =>
                !value.trim() ||
                normalizeWebsite(value) != null ||
                "Enter a valid URL",
            }}
            render={({ field }) => (
              <Field data-invalid={!!errors.website || undefined}>
                <FieldLabel htmlFor={idOf("website")}>Website</FieldLabel>
                <Input
                  {...field}
                  id={idOf("website")}
                  aria-invalid={!!errors.website || undefined}
                  aria-describedby={errorOf("website")}
                  inputMode="url"
                  placeholder="https://example.com"
                  onBlur={(event) => {
                    field.onBlur();
                    const normalized = normalizeWebsite(event.target.value);
                    if (normalized) {
                      setValue("website", normalized, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }
                  }}
                />
                {errors.website && (
                  <FieldError id={errorOf("website")}>
                    {errors.website.message}
                  </FieldError>
                )}
              </Field>
            )}
          />
        </div>

        {/* Description */}
        <Controller
          name="description"
          control={control}
          rules={{
            maxLength: {
              value: 1000,
              message: "Description must be under 1000 characters",
            },
          }}
          render={({ field }) => (
            <Field data-invalid={!!errors.description || undefined}>
              <FieldLabel htmlFor={idOf("description")}>
                Description (optional)
              </FieldLabel>
              <Textarea
                {...field}
                id={idOf("description")}
                aria-invalid={!!errors.description || undefined}
                aria-describedby={errorOf("description")}
                rows={2}
                className="max-h-28"
                placeholder="A brief description of the place..."
              />
              {errors.description && (
                <FieldError id={errorOf("description")}>
                  {errors.description.message}
                </FieldError>
              )}
            </Field>
          )}
        />

        {/* Submit */}
        <Button
          type="submit"
          disabled={loading || (duplicates.length > 0 && !duplicatesConfirmed)}
          aria-busy={loading || undefined}
          size="lg"
          className="mt-2"
        >
          {loading && <Spinner />}
          {editing ? "Send for review" : "Add Place"}
        </Button>

        {duplicates.length > 0 && !duplicatesConfirmed && (
          <p className="type-footnote text-center text-ink-2">
            Please review the similar places above before submitting
          </p>
        )}
      </div>
    </form>
  );
}
