"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "urql";
import { EmptyState } from "@/components/app/EmptyState";
import {
  AddPlace,
  Check,
  ErrorIcon,
  Place,
  Scan,
  Search,
} from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { useNavigate } from "@/components/app/useNavigate";
import { usePlaceActions } from "@/components/map/actions";
import { LocationPrePrompt } from "@/components/map/core/LocationPrePrompt";
import { useGeolocation } from "@/components/map/hooks/useGeolocation";
import { formatCategoryName } from "@/components/map/places/place-utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { isOffered, useAiCapabilities } from "@/lib/ai/capabilities";
import {
  formatDistance,
  type KnownPlace,
  menuPlaceHint,
  nearestKnownPlace,
  otherPlaces,
} from "@/lib/capture/menu-place";
import { dataUrlToFile } from "@/lib/items/data-url";
import { CaptureCamera } from "./CaptureCamera";
import { CaptureHeader, CapturePhotoPreview } from "./CaptureChrome";
import { type CreatedPlace, NewPlaceSheet } from "./NewPlaceSheet";
import { nearbyWithCreated, offerNewPlace } from "./new-place";
import { PlacePickerSheet } from "./place/PlacePickerSheet";
import { CaptureNearbyPlacesQuery } from "./queries";

/**
 * D14's one line for the scanner, said by `LocationPrePrompt` before the
 * browser asks: why a menu wants the position.
 */
export const MENU_LOCATION_PRE_PROMPT_COPY =
  "Use your location to find the place this menu is from.";

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
 * and where the person stood when that place is one of those around them
 * (`lib/capture/menu-place.ts`).
 */
export function MenuCapture({
  leading,
  modeRow,
  initialPhoto,
}: MenuCaptureProps) {
  const navigate = useNavigate();
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
  // L10: nothing the app knows within 50 m — offer to add the place inline.
  const offerAdd = offerNewPlace({
    location,
    nearby,
    searching: nearbyFetching,
  });

  const [photo, setPhoto] = useState<string | null>(initialPhoto ?? null);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [declined, setDeclined] = useState(false);
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);
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

  const send = async (
    shot: string,
    place: Chosen,
    around: readonly KnownPlace[] = nearby,
  ) => {
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
      menuPlaceHint({ confirmed: place, nearby: around, location }),
    );
    if (result.success && result.scanId !== undefined) {
      const href = `/map/scans/${result.scanId}`;
      if (mounted.current) {
        navigate.push(href);
      } else {
        notify(`The menu from ${place.name} is being read`, {
          undo: () => navigate.push(href),
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

  /**
   * L10: a place made inline (Under review) is settled the moment it exists,
   * and a held photo goes filed on it — with the position, since the place
   * was pinned where the person stands (L24: settled before upload).
   */
  const created = (place: CreatedPlace) => {
    const settled = { id: place.id, name: place.name };
    const around = nearbyWithCreated(nearby, place);
    setChosen(settled);
    setAdding(false);
    if (photo !== null) void send(photo, settled, around);
  };

  const onShutter = (shot: string) => {
    setPhoto(shot);
    setSending({ kind: "idle" });
    if (chosen !== null) {
      void send(shot, chosen);
      return;
    }
    // Nothing to ask "At …?" about: add the place when none is here, or pick.
    if (nearest === null && offerAdd) setAdding(true);
    else if (nearest === null || declined) setPicking(true);
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
            <p role="status" className="flex items-center gap-2 t-cap">
              <Spinner aria-hidden className="size-4" />
              Sending the menu…
            </p>
          ) : chosen === null ? (
            <p className="t-cap">
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
        onAdd={offerAdd ? () => setAdding(true) : undefined}
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
        <p className="text-center t-cap text-ink-2">
          Get the whole drinks list in. Each line is read and matched to the
          catalog.
        </p>
      )}

      <PlacePickerSheet
        open={picking}
        onOpenChange={setPicking}
        // "Somewhere else" means not the guess: it is left out either way,
        // and leads the list only while it is still a candidate.
        nearby={otherPlaces(nearby, nearest?.id ?? null)}
        guess={declined ? null : nearest}
        onChoose={choose}
        onAdd={
          location === null
            ? undefined
            : () => {
                setPicking(false);
                setAdding(true);
              }
        }
      />

      <NewPlaceSheet
        open={adding}
        onOpenChange={setAdding}
        location={location}
        hasPhoto={photo !== null}
        onCreated={created}
        onPickInstead={() => {
          setAdding(false);
          setPicking(true);
        }}
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
  onAdd,
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
  /** L10: no place within 50 m — add it here. */
  onAdd?: () => void;
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
        <p className="t-head flex items-center gap-1.5 text-ink-1">
          <Check aria-hidden className="size-4 shrink-0 text-success" />
          <span className="truncate">At {chosen.name}</span>
        </p>
        <p className="t-cap">The menu is filed here.</p>
      </>,
      <Button variant="ghost" size="sm" onClick={onPick} disabled={disabled}>
        Change
      </Button>,
    );
  }

  if (nearest !== null) {
    return shell(
      <>
        <p className="t-head truncate text-ink-1">At {nearest.name}?</p>
        <p className="t-cap">
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

  // D14: our one line first (`LocationPrePrompt`, the map's own, L10); the
  // browser's prompt only from its Continue. Not gated on the map's "Not
  // now": that dismissed the map's banner, and this card is a different
  // question with its own way past it (Pick the place).
  if (geo.permission === "prompt" && !geo.requested) {
    return (
      <section
        aria-label="Where this menu is from"
        data-slot="menu-place"
        className="flex flex-col"
      >
        <LocationPrePrompt
          copy={MENU_LOCATION_PRE_PROMPT_COPY}
          continueLabel="Use my location"
          dismissLabel="Pick the place"
          onContinue={geo.request}
          onDismiss={onPick}
          disabled={disabled}
        />
      </section>
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
      <p role="status" className="t-cap flex items-center gap-2 text-ink-2">
        <Spinner aria-hidden className="size-4" />
        Finding where you are…
      </p>,
      pick,
    );
  }

  return shell(
    <>
      <p className="t-head text-ink-1">Which place is this menu from?</p>
      <p className="t-cap">
        {geo.location === null
          ? "Pick it, and the menu is filed there."
          : declined
            ? "Pick it, or add it if it isn't listed."
            : "No place we know is right here. Pick it, or add it."}
      </p>
    </>,
    onAdd === undefined ? (
      pick
    ) : (
      <>
        <Button onClick={onAdd} disabled={disabled}>
          <AddPlace aria-hidden />
          Add this place
        </Button>
        {pick}
      </>
    ),
  );
}
