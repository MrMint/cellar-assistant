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
 * - `createPlace` gets a client-minted `placeId` (a retried submit is
 *   idempotent) and does the rate limit, duplicate re-check and AI review
 *   server-side — closed, where the old action failed open.
 */

import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormHelperText,
  FormLabel,
  IconButton,
  Input,
  Stack,
  Textarea,
  Typography,
} from "@mui/joy";
import type { CountryCode } from "libphonenumber-js";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Controller, type SubmitHandler, useForm } from "react-hook-form";
import { MdArrowBack, MdMyLocation } from "react-icons/md";
import {
  isSupportedCountry,
  isValidPhoneNumber,
} from "react-phone-number-input";
import PhoneInput from "react-phone-number-input/input";
import {
  type CreatePlaceInput,
  type DuplicatePlace,
  type GoogleAutocompleteSuggestion,
  type GoogleNearbyPlace,
  usePlaceActions,
} from "../actions";
import { googlePrefillFields } from "../adapter";
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

interface CategoryOption {
  label: string;
  value: UserPlaceCategory;
  tier: string;
}

const CATEGORY_OPTIONS: CategoryOption[] = [
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
  categories: CategoryOption[];
  street_address: string;
  locality: string;
  region: string;
  postcode: string;
  country_code: string;
  phone: string;
  website: string;
  description: string;
}

interface CreatePlaceFormProps {
  latitude: number;
  longitude: number;
}

// =============================================================================
// Component
// =============================================================================

export function CreatePlaceForm({ latitude, longitude }: CreatePlaceFormProps) {
  const router = useRouter();
  const {
    checkDuplicatePlacesAction,
    googlePlaceDetailsAction,
    createUserPlaceAction,
    googleNearbySearchAction,
    reverseGeocodeAction,
  } = usePlaceActions();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicatePlace[]>([]);
  const [duplicatesConfirmed, setDuplicatesConfirmed] = useState(false);
  const [addressLoading, setAddressLoading] = useState(true);
  const duplicateCheckTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Google Places state
  const [googlePlaces, setGooglePlaces] = useState<GoogleNearbyPlace[]>([]);
  const [googlePlacesLoading, setGooglePlacesLoading] = useState(true);
  const [googlePlacesDismissed, setGooglePlacesDismissed] = useState(false);
  const [selectedGooglePlaceId, setSelectedGooglePlaceId] = useState<
    string | null
  >(null);
  const [enriching, setEnriching] = useState(false);
  /** Which pick's details may still land — a later pick retires earlier ones. */
  const prefillRequest = useRef(0);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting, errors },
  } = useForm<FormFields>({
    defaultValues: {
      name: "",
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
  const countryCodeValue = watch("country_code");
  const phoneCountry = toSupportedCountryCode(countryCodeValue) ?? "US";

  // Auto-fill address from reverse geocode + fetch Google nearby places on mount
  useEffect(() => {
    let cancelled = false;

    setAddressLoading(true);
    reverseGeocodeAction(latitude, longitude)
      .then((result) => {
        if (cancelled) return;
        if (result) {
          if (result.street_address)
            setValue("street_address", result.street_address);
          if (result.locality) setValue("locality", result.locality);
          if (result.region) setValue("region", result.region);
          if (result.postcode) setValue("postcode", result.postcode);
          if (result.country_code) {
            setValue("country_code", result.country_code.toUpperCase());
          }
        }
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
        const { duplicates: found } = await checkDuplicatePlacesAction(
          trimmed,
          latitude,
          longitude,
        );
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
  }, [nameValue, latitude, longitude, checkDuplicatePlacesAction]);

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
    };

    startTransition(async () => {
      const result = await createUserPlaceAction(input);

      if (result.success && result.placeId) {
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
      <Stack spacing={2.5}>
        {/* Back button + location preview */}
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton
            variant="outlined"
            color="neutral"
            size="sm"
            onClick={() => router.push("/map")}
          >
            <MdArrowBack />
          </IconButton>
          <Chip
            variant="soft"
            color="neutral"
            startDecorator={<MdMyLocation />}
            size="sm"
          >
            {latitude.toFixed(5)}, {longitude.toFixed(5)}
          </Chip>
        </Stack>

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
        {googlePlacesDismissed && !selectedGooglePlaceId && (
          <GooglePlaceSearch
            latitude={latitude}
            longitude={longitude}
            onSelect={handleGoogleAutocompleteSuggestionSelect}
            disabled={enriching}
          />
        )}

        {/* Pre-filled indicator */}
        {selectedGooglePlaceId && (
          <Chip variant="soft" color="success" size="sm">
            Pre-filled from Google
          </Chip>
        )}

        {/* Enriching indicator */}
        {enriching && (
          <Chip
            variant="soft"
            color="neutral"
            size="sm"
            startDecorator={
              <CircularProgress
                size="sm"
                sx={{ "--CircularProgress-size": "14px" }}
              />
            }
          >
            Fetching place details...
          </Chip>
        )}

        {/* Duplicate check */}
        <DuplicatePlaceCheck
          duplicates={duplicates}
          onSelectExisting={handleSelectExisting}
          onConfirmNew={handleConfirmNew}
        />

        {/* Server error */}
        {serverError && (
          <Alert color="danger" size="sm">
            {serverError}
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
            <FormControl error={!!errors.name}>
              <FormLabel>Name *</FormLabel>
              <Input {...field} placeholder="e.g. The Rusty Barrel" />
              {errors.name && (
                <FormHelperText>{errors.name.message}</FormHelperText>
              )}
            </FormControl>
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
            <FormControl error={!!errors.categories}>
              <FormLabel>Categories *</FormLabel>
              <Autocomplete
                multiple
                options={CATEGORY_OPTIONS}
                groupBy={(option) => option.tier}
                getOptionLabel={(option) => option.label}
                isOptionEqualToValue={(option, value) =>
                  option.value === value.value
                }
                value={field.value}
                onChange={(_, newValue) => field.onChange(newValue)}
                placeholder="Select categories..."
                size="sm"
              />
              {errors.categories && (
                <FormHelperText>{errors.categories.message}</FormHelperText>
              )}
            </FormControl>
          )}
        />

        <Divider />

        {/* Address section */}
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography level="title-sm">Address</Typography>
          {addressLoading ? (
            <Chip
              variant="soft"
              color="neutral"
              size="sm"
              startDecorator={
                <CircularProgress
                  size="sm"
                  sx={{ "--CircularProgress-size": "14px" }}
                />
              }
            >
              Loading address...
            </Chip>
          ) : (
            <Chip variant="soft" color="success" size="sm">
              Auto-filled from pin
            </Chip>
          )}
        </Stack>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 2,
          }}
        >
          <Controller
            name="street_address"
            control={control}
            render={({ field }) => (
              <FormControl sx={{ gridColumn: { xs: "1", sm: "1 / -1" } }}>
                <FormLabel>Street Address</FormLabel>
                <Input {...field} placeholder="123 Main St" size="sm" />
              </FormControl>
            )}
          />

          <Controller
            name="locality"
            control={control}
            render={({ field }) => (
              <FormControl>
                <FormLabel>City</FormLabel>
                <Input {...field} placeholder="City" size="sm" />
              </FormControl>
            )}
          />

          <Controller
            name="region"
            control={control}
            render={({ field }) => (
              <FormControl>
                <FormLabel>State/Region</FormLabel>
                <Input {...field} placeholder="State" size="sm" />
              </FormControl>
            )}
          />

          <Controller
            name="postcode"
            control={control}
            render={({ field }) => (
              <FormControl>
                <FormLabel>Postal Code</FormLabel>
                <Input {...field} placeholder="12345" size="sm" />
              </FormControl>
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
              <FormControl error={!!errors.country_code}>
                <FormLabel>Country Code</FormLabel>
                <Input
                  {...field}
                  value={field.value}
                  onChange={(event) =>
                    field.onChange(event.target.value.toUpperCase().slice(0, 2))
                  }
                  placeholder="US"
                  size="sm"
                />
                {errors.country_code && (
                  <FormHelperText>{errors.country_code.message}</FormHelperText>
                )}
              </FormControl>
            )}
          />
        </Box>

        <Divider />

        {/* Contact info */}
        <Typography level="title-sm">Contact (optional)</Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 2,
          }}
        >
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
              <FormControl error={!!errors.phone}>
                <FormLabel>Phone</FormLabel>
                <Box
                  sx={{
                    border: "1px solid",
                    borderColor: errors.phone
                      ? "danger.outlinedBorder"
                      : "neutral.outlinedBorder",
                    borderRadius: "sm",
                    px: 1.5,
                    py: 1,
                    "& input": {
                      width: "100%",
                      border: "none",
                      outline: "none",
                      font: "inherit",
                      background: "transparent",
                    },
                  }}
                >
                  <PhoneInput
                    country={phoneCountry}
                    international
                    withCountryCallingCode
                    value={field.value || undefined}
                    onChange={(value) => field.onChange(value ?? "")}
                    onBlur={field.onBlur}
                    name={field.name}
                    placeholder="+1 555 123 4567"
                  />
                </Box>
                {errors.phone && (
                  <FormHelperText>{errors.phone.message}</FormHelperText>
                )}
              </FormControl>
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
              <FormControl error={!!errors.website}>
                <FormLabel>Website</FormLabel>
                <Input
                  {...field}
                  placeholder="https://example.com"
                  size="sm"
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
                  <FormHelperText>{errors.website.message}</FormHelperText>
                )}
              </FormControl>
            )}
          />
        </Box>

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
            <FormControl error={!!errors.description}>
              <FormLabel>Description (optional)</FormLabel>
              <Textarea
                {...field}
                minRows={2}
                maxRows={4}
                placeholder="A brief description of the place..."
                size="sm"
              />
              {errors.description && (
                <FormHelperText>{errors.description.message}</FormHelperText>
              )}
            </FormControl>
          )}
        />

        {/* Submit */}
        <Button
          type="submit"
          loading={loading}
          disabled={loading || (duplicates.length > 0 && !duplicatesConfirmed)}
          size="lg"
          sx={{ mt: 1 }}
        >
          Add Place
        </Button>

        {duplicates.length > 0 && !duplicatesConfirmed && (
          <Typography level="body-xs" color="warning" textAlign="center">
            Please review the similar places above before submitting
          </Typography>
        )}
      </Stack>
    </form>
  );
}
