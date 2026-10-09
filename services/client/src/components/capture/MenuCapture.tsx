"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "urql";
import { BottomSheet } from "@/components/app/BottomSheet";
import { EmptyState } from "@/components/app/EmptyState";
import {
  Check,
  ChevronRight,
  ErrorIcon,
  MapIcon,
  MyLocation,
  Place,
  Scan,
  Search,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { notify } from "@/components/app/notify";
import { usePlaceActions } from "@/components/map/actions";
import { useGeolocation } from "@/components/map/hooks/useGeolocation";
import { formatCategoryName } from "@/components/map/places/place-utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { isOffered, useAiCapabilities } from "@/lib/ai/capabilities";
import { unwrapResult } from "@/lib/api/result";
import {
  formatDistance,
  type KnownPlace,
  menuPlaceHint,
  nearestKnownPlace,
  otherPlaces,
} from "@/lib/capture/menu-place";
import { dataUrlToFile } from "@/lib/items/data-url";
import { cn } from "@/lib/utils";
import { CaptureCamera } from "./CaptureCamera";
import { CaptureHeader, CapturePhotoPreview } from "./CaptureChrome";
import { CaptureNearbyPlacesQuery, CapturePlaceSearchQuery } from "./queries";

/** How many nearby places the question and the picker look at. */
const NEARBY_LIMIT = 8;

/** Where a menu is filed: a place the person picked or confirmed. */
type Chosen = Pick<KnownPlace, "id" | "name">;

type Sending =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "failed"; reason: string };

export type MenuCaptureProps = {
  /** Before the title: the surface's Close. */
  leading?: ReactNode;
  /** Right under the picture: the surface's mode row. */
  modeRow?: ReactNode;
  /** A photo carried in (a label read that said "menu"): no new shot. */
  initialPhoto?: string;
};

/**
 * Menu mode of the capture surface (X06): **scan a menu from anywhere**, not
 * only from its place's page.
 *
 * A scan is filed on a place, so the place is settled before the scan is
 * sent — but never silently. The person's position (D14: our one line, then
 * the browser's prompt) finds the nearest place the app knows, and the card
 * under the camera asks "At Cork & Barrel?": one tap confirms it. "Somewhere
 * else" (or no place nearby, or no location) opens a picker: the other
 * places nearby, a search by name, and "add the place" for one the app has
 * never seen.
 *
 * The shutter never waits on the question: a photo taken before the place is
 * settled is held, and the tap that settles it sends the scan. Once sent,
 * the results page takes over (`/map/scans/[id]` shows the read and the
 * matching land, N06a). The scan's `placeHint` carries the confirmed place,
 * the nearest guess if it was a different one, and where the person stood
 * (`lib/capture/menu-place.ts`).
 */
export function MenuCapture({
  leading,
  modeRow,
  initialPhoto,
}: MenuCaptureProps) {
  const router = useRouter();
  const capabilities = useAiCapabilities();
  const geo = useGeolocation();
  const { uploadAndProcessMenuScan } = usePlaceActions();

  const location = geo.location;
  const [{ data: nearbyData, fetching: nearbyFetching }] = useQuery({
    query: CaptureNearbyPlacesQuery,
    variables: {
      location: {
        lat: location?.latitude ?? 0,
        lng: location?.longitude ?? 0,
      },
      limit: NEARBY_LIMIT,
    },
    pause: location === null,
  });
  const nearby = useMemo<KnownPlace[]>(
    () =>
      (nearbyData?.me?.nearbyPlaces.edges ?? []).map(({ node }) => ({
        id: node.place.id,
        name: node.place.name,
        distanceMeters: node.distanceMeters,
        category: node.place.primaryCategory,
      })),
    [nearbyData],
  );
  const nearest = useMemo(() => nearestKnownPlace(nearby), [nearby]);

  const [photo, setPhoto] = useState<string | null>(initialPhoto ?? null);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [declined, setDeclined] = useState(false);
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState<Sending>({ kind: "idle" });

  // A send outlives this surface (Close, or a tab, mid-upload): it must not
  // then pull the person onto the results page from wherever they went.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const send = async (shot: string, place: Chosen) => {
    const file = dataUrlToFile(shot, `menu-scan-${Date.now()}.jpg`);
    if (file === null) {
      setSending({
        kind: "failed",
        reason: "The photo could not be read. Retake it.",
      });
      return;
    }
    setSending({ kind: "sending" });
    const result = await uploadAndProcessMenuScan(
      file,
      menuPlaceHint({ confirmed: place, nearest, location }),
    );
    if (result.success && result.scanId !== undefined) {
      const href = `/map/scans/${result.scanId}`;
      if (mounted.current) {
        router.push(href);
      } else {
        notify(`The menu from ${place.name} is being read`, {
          undo: () => router.push(href),
          actionLabel: "See it",
          durationMs: 15_000,
        });
      }
      return;
    }
    if (!mounted.current) {
      notify("The menu wasn't sent", {
        description: result.error ?? "The scan could not be started.",
        tone: "error",
      });
      return;
    }
    setSending({
      kind: "failed",
      reason: result.error ?? "The scan could not be started.",
    });
  };

  /** A place settled: remembered, and a held photo goes at once. */
  const choose = (place: Chosen) => {
    setChosen(place);
    setPicking(false);
    if (photo !== null) void send(photo, place);
  };

  const onShutter = (shot: string) => {
    setPhoto(shot);
    setSending({ kind: "idle" });
    if (chosen !== null) {
      void send(shot, chosen);
      return;
    }
    // Nothing to ask "At …?" about: go straight to the picker.
    if (nearest === null || declined) setPicking(true);
  };

  if (!isOffered(capabilities, "menuScan")) {
    return (
      <div className="flex flex-col gap-4">
        <CaptureHeader leading={leading} title="Scan a menu" />
        {modeRow}
        <EmptyState
          illustration={<Scan aria-hidden className="size-10" />}
          title="Menus can't be read here."
          description="This server has no AI to read a menu with. You can still add bottles and places."
        />
      </div>
    );
  }

  const busy = sending.kind === "sending";

  return (
    <div data-slot="menu-capture" className="flex flex-col gap-3">
      <CaptureHeader leading={leading} title="Scan a menu" />

      {photo === null ? (
        <CaptureCamera
          onCapture={onShutter}
          shutterLabel="Photograph the menu"
        />
      ) : (
        <CapturePhotoPreview
          photo={photo}
          alt="Your menu, as snapped"
          onRetake={
            busy
              ? undefined
              : () => {
                  setPhoto(null);
                  setSending({ kind: "idle" });
                }
          }
        >
          {busy ? (
            <p role="status" className="flex items-center gap-2 type-callout">
              <Spinner aria-hidden className="size-4" />
              Sending the menu…
            </p>
          ) : chosen === null ? (
            <p className="type-callout">
              Where&rsquo;s this menu from? It&rsquo;s read as soon as you say.
            </p>
          ) : null}
        </CapturePhotoPreview>
      )}

      {/* Not while the photo is going up: a switch would drop it mid-send. */}
      {!busy && modeRow}

      <PlaceCard
        chosen={chosen}
        nearest={declined ? null : nearest}
        declined={declined && nearest !== null}
        geo={geo}
        searching={location !== null && nearbyFetching}
        disabled={busy}
        onConfirm={choose}
        onDecline={() => {
          setDeclined(true);
          setPicking(true);
        }}
        onPick={() => setPicking(true)}
      />

      {sending.kind === "failed" && (
        <Alert variant="destructive" className="border-destructive/60">
          <ErrorIcon aria-hidden />
          <AlertDescription className="gap-2 text-destructive/90">
            <p>{sending.reason}</p>
            {photo !== null && chosen !== null && (
              <Button
                variant="secondary"
                onClick={() => void send(photo, chosen)}
              >
                Try again
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {photo === null && (
        <p className="text-center type-callout text-ink-2">
          Get the whole drinks list in. Each line is read and matched to the
          catalog.
        </p>
      )}

      <PlacePicker
        open={picking}
        onOpenChange={setPicking}
        // "Somewhere else" means not the guess: it is left out either way,
        // and leads the list only while it is still a candidate.
        nearby={otherPlaces(nearby, nearest?.id ?? null)}
        guess={declined ? null : nearest}
        onChoose={choose}
      />
    </div>
  );
}

/**
 * The question under the camera, in whichever form the position allows:
 * D14's one-line reason before the browser is asked, "At …?" with a nearest
 * place, the confirmed place with Change, or a way to pick one by hand.
 */
function PlaceCard({
  chosen,
  nearest,
  declined,
  geo,
  searching,
  disabled,
  onConfirm,
  onDecline,
  onPick,
}: {
  chosen: Chosen | null;
  nearest: KnownPlace | null;
  /** The nearest place was there, and the person said "Somewhere else". */
  declined: boolean;
  geo: ReturnType<typeof useGeolocation>;
  searching: boolean;
  disabled: boolean;
  onConfirm: (place: Chosen) => void;
  onDecline: () => void;
  onPick: () => void;
}) {
  const shell = (body: ReactNode, actions?: ReactNode) => (
    <section
      aria-label="Where this menu is from"
      data-slot="menu-place"
      className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4"
    >
      <div className="flex items-start gap-3">
        <Place
          aria-hidden
          className="mt-0.5 size-5 shrink-0 text-ink-2"
          strokeWidth={1.75}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">{body}</div>
      </div>
      {actions !== undefined && (
        <div className="flex flex-wrap gap-2">{actions}</div>
      )}
    </section>
  );

  if (chosen !== null) {
    return shell(
      <>
        <p className="type-headline flex items-center gap-1.5 text-ink-1">
          <Check aria-hidden className="size-4 shrink-0 text-success" />
          <span className="truncate">At {chosen.name}</span>
        </p>
        <p className="type-footnote">The menu is filed here.</p>
      </>,
      <Button variant="ghost" size="sm" onClick={onPick} disabled={disabled}>
        Change
      </Button>,
    );
  }

  if (nearest !== null) {
    return shell(
      <>
        <p className="type-headline truncate text-ink-1">At {nearest.name}?</p>
        <p className="type-footnote">
          {[
            nearest.category ? formatCategoryName(nearest.category) : null,
            `${formatDistance(nearest.distanceMeters)} away`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </>,
      <>
        <Button
          className="flex-1"
          onClick={() => onConfirm(nearest)}
          disabled={disabled}
        >
          Yes, I&rsquo;m here
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          onClick={onDecline}
          disabled={disabled}
        >
          Somewhere else
        </Button>
      </>,
    );
  }

  const pick = (
    <Button variant="secondary" onClick={onPick} disabled={disabled}>
      <Search aria-hidden />
      Pick the place
    </Button>
  );

  // D14: our one line first; the browser's prompt only from this tap. Not
  // gated on the map's "Not now": that dismissed the map's banner, and this
  // card is a different question with its own way past it (Pick the place).
  if (geo.permission === "prompt" && !geo.requested) {
    return shell(
      <>
        <p className="type-headline text-ink-1">Where are you?</p>
        <p className="type-footnote">
          Your location finds the place this menu is from. It&rsquo;s only used
          to file the menu.
        </p>
      </>,
      <>
        <Button onClick={geo.request} disabled={disabled}>
          <MyLocation aria-hidden />
          Use my location
        </Button>
        {pick}
      </>,
    );
  }

  // Still asking the browser what it would say, a watch with no fix yet, or
  // the nearby read in flight: never "no place here" before we know.
  if (
    searching ||
    geo.permission === "unknown" ||
    (geo.requested && geo.loading)
  ) {
    return shell(
      <p
        role="status"
        className="type-callout flex items-center gap-2 text-ink-2"
      >
        <Spinner aria-hidden className="size-4" />
        Finding where you are…
      </p>,
      pick,
    );
  }

  return shell(
    <>
      <p className="type-headline text-ink-1">Which place is this menu from?</p>
      <p className="type-footnote">
        {geo.location === null
          ? "Pick it, and the menu is filed there."
          : declined
            ? "Pick it, or add it if it isn't listed."
            : "No place we know is right here. Pick it, or add it."}
      </p>
    </>,
    pick,
  );
}

/** One place to tap in the picker. */
function PlaceChoice({
  place,
  detail,
  emphasis = false,
  onChoose,
}: {
  place: Chosen;
  detail?: string;
  emphasis?: boolean;
  onChoose: (place: Chosen) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onChoose(place)}
        className={cn(
          "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left outline-none active:bg-surface-3 focus-visible:bg-surface-3",
        )}
      >
        <Place
          aria-hidden
          className="size-5 shrink-0 text-ink-2"
          strokeWidth={1.75}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={cn(
              "truncate text-ink-1",
              emphasis ? "type-headline" : "type-body",
            )}
          >
            {place.name}
          </span>
          {detail !== undefined && detail !== "" && (
            <span className="type-footnote truncate">{detail}</span>
          )}
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-3" />
      </button>
    </li>
  );
}

const detailOf = (place: KnownPlace): string =>
  [
    place.category ? formatCategoryName(place.category) : null,
    formatDistance(place.distanceMeters),
  ]
    .filter(Boolean)
    .join(" · ");

/** The picker: the guess, the rest nearby, a name search, and "add it". */
function PlacePicker({
  open,
  onOpenChange,
  guess,
  nearby,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guess: KnownPlace | null;
  nearby: readonly KnownPlace[];
  onChoose: (place: Chosen) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const [{ data, fetching }] = useQuery({
    query: CapturePlaceSearchQuery,
    variables: { query: debounced, first: 8 },
    pause: !open || debounced.length < 2,
  });
  const found = useMemo(() => {
    const result = unwrapResult(data?.placeSearch, "PlaceSearchConnection");
    return result.ok ? result.data.edges.map(({ node }) => node) : [];
  }, [data]);
  const searchingByName = debounced.length >= 2;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Where's this menu from?"
      footer={
        <Button variant="ghost" asChild>
          <Link href="/map/create-place" underline="none">
            <MapIcon aria-hidden />
            Not listed? Add the place
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-3 pb-2">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search places by name"
            aria-label="Search places by name"
            className="pl-9"
          />
        </div>
        {searchingByName ? (
          fetching && found.length === 0 ? (
            <p
              role="status"
              className="type-callout flex items-center gap-2 px-1 text-ink-2"
            >
              <Spinner aria-hidden className="size-4" />
              Searching…
            </p>
          ) : found.length === 0 ? (
            <p className="type-callout px-1 text-ink-2">
              No place by that name yet.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg bg-surface-1">
              {found.map((place) => (
                <PlaceChoice
                  key={place.id}
                  place={place}
                  detail={[
                    place.primaryCategory
                      ? formatCategoryName(place.primaryCategory)
                      : null,
                    place.locality,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  onChoose={onChoose}
                />
              ))}
            </ul>
          )
        ) : guess === null && nearby.length === 0 ? (
          <p className="type-callout px-1 text-ink-2">
            Search for the bar, shop or restaurant by name.
          </p>
        ) : (
          <ul
            aria-label="Places near you"
            className="flex flex-col divide-y divide-line overflow-hidden rounded-lg bg-surface-1"
          >
            {guess !== null && (
              <PlaceChoice
                place={guess}
                detail={`Nearest · ${formatDistance(guess.distanceMeters)}`}
                emphasis
                onChoose={onChoose}
              />
            )}
            {nearby.map((place) => (
              <PlaceChoice
                key={place.id}
                place={place}
                detail={detailOf(place)}
                onChoose={onChoose}
              />
            ))}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}
