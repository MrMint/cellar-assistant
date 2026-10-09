"use client";

import { useActor } from "@xstate/react";
import { usePathname, useRouter } from "next/navigation";
import { includes, isNotNil } from "ramda";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useClient, useQuery } from "urql";
import { BottomSheet } from "@/components/app/BottomSheet";
import { Camera, ErrorIcon, Scan, Warning } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { TypeChip } from "@/components/app/TypeChip";
import { CaptureCamera } from "@/components/capture/CaptureCamera";
import {
  CaptureHeader,
  CapturePhotoPreview,
} from "@/components/capture/CaptureChrome";
import {
  type AddableCellar,
  CellarPicker,
} from "@/components/capture/CellarPicker";
import { captureDrafts } from "@/components/capture/drafts";
import { CaptureFileUrlQuery } from "@/components/capture/queries";
import { SuccessSheet } from "@/components/capture/SuccessSheet";
import { TypePicker } from "@/components/capture/TypePicker";
import {
  type ApiItemType,
  itemTypeLabel,
} from "@/components/cellar-api/itemTypes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { unwrapResult } from "@/lib/api/result";
import {
  defaultCellarId,
  defaultItemType,
  readCapturePrefs,
  rememberCapturePrefs,
} from "@/lib/capture/capture-prefs";
import { BACKGROUND_AFTER_MS, draftIdFrom } from "@/lib/capture/draft-store";
import {
  captureHrefWithPhoto,
  photoHandoff,
} from "@/lib/capture/photo-handoff";
import { AiStatus } from "../AiStatus";
import { AnimationShowcase, type ShowcaseStage } from "../AnimationShowcase";
import { QuickAddCard } from "../QuickAddCard";
import { emptyDefaults } from "./adapter";
import { CatalogMatchPrompt } from "./CatalogMatchPrompt";
import { catalogMatchSummary } from "./catalog-match";
import { type OnboardingResult, OnboardingWizard } from "./index";
import { MatchList } from "./MatchList";
import { OnboardingMachine } from "./machines";
import { OnboardingItemForm } from "./OnboardingItemForm";

export type ItemOnboardingProps = {
  /** The type to read the label as: the route's, or the first default. */
  type: ApiItemType;
  /** A cellar the route pins the bottle to. */
  cellarId?: string;
  /** Its name, for the success sheet, when the page has it. */
  cellarName?: string;
  /** Generic entries (`/add`): the person picks the type (last used first). */
  chooseType?: boolean;
  /** `type` came from the entry (`?type=`), so the last used does not replace it. */
  typeExplicit?: boolean;
  /**
   * The cellars the viewer may add to, for the draft card's "Into" row when
   * no cellar is pinned. The default is the last used (X05).
   */
  cellars?: readonly AddableCellar[];
  /** `?draft=<id>`: reopen a read left running in the background. */
  resumeId?: string;
  /** Before the title: the capture surface's Close (X06). */
  leading?: ReactNode;
  /**
   * Right under the camera while framing: the capture surface's mode row,
   * Bottle · Menu · Recipe (X06). Gone once the shutter has fired.
   */
  modeRow?: ReactNode;
  /**
   * A label photo carried in (photo search's fallback, X06): shown in the
   * camera's place with the type row, and read on "Read this label".
   */
  initialPhoto?: string;
  /**
   * The read said "menu" (`surfaceKind`): switch to Menu mode with the same
   * photo. Without it, the photo is carried to `/add?mode=menu`.
   */
  onScanAsMenu?: (photo: string | undefined) => void;
};

/**
 * Adding a bottle: snap once, read at the shutter, a draft card, a real
 * ending (X05, N21). One component over all six types; "Snap another"
 * starts a fresh run in place.
 */
export const ItemOnboarding = (props: ItemOnboardingProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const [run, setRun] = useState(0);
  const [resumeId, setResumeId] = useState(() => draftIdFrom(props.resumeId));
  const restart = useCallback(() => {
    // Drop `?draft=`: the next run is a new bottle.
    if (resumeId !== undefined) router.replace(pathname);
    setResumeId(undefined);
    setRun((n) => n + 1);
  }, [resumeId, router, pathname]);
  return (
    <ItemOnboardingRun
      key={run}
      {...props}
      resumeId={resumeId}
      // A carried photo is the first bottle's; "Snap another" is a new one.
      initialPhoto={run === 0 ? props.initialPhoto : undefined}
      onRestart={restart}
    />
  );
};

const ItemOnboardingRun = ({
  type,
  cellarId: pinnedCellarId,
  cellarName: pinnedCellarName,
  chooseType = false,
  typeExplicit = false,
  cellars,
  resumeId,
  leading,
  modeRow,
  initialPhoto,
  onScanAsMenu,
  onRestart,
}: ItemOnboardingProps & { onRestart: () => void }) => {
  const urqlClient = useClient();
  const router = useRouter();
  const pathname = usePathname();

  const resumeHref = useCallback(
    (id: string, itemType: ApiItemType) => {
      const query = new URLSearchParams({ draft: id });
      if (chooseType) query.set("type", itemType);
      return `${pathname}?${query.toString()}`;
    },
    [chooseType, pathname],
  );

  const [state, send] = useActor(OnboardingMachine, {
    input: {
      urqlClient,
      cellarId: pinnedCellarId,
      router,
      itemType: type,
      draft: { resumeHref },
      resumeId,
      resumePhoto:
        resumeId === undefined
          ? undefined
          : captureDrafts.get(resumeId)?.meta.photo,
      onRestart,
    },
  });
  const { context } = state;
  const itemType = context.itemType;
  // The scanner's code, as read off the label — not a stored (canonical)
  // one, so it is shown and sent as printed.
  const { barcode: scanned } = context;

  // A label photo carried in (X06): read on the person's tap, so the type
  // row can be set first. "Retake" drops it for the live camera.
  const [carried, setCarried] = useState<string | undefined>(initialPhoto);

  // Defaults that live in this browser (X05: last used, never a classifier),
  // applied after mount so the server render and hydration agree.
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    const prefs = readCapturePrefs();
    if (chooseType && resumeId === undefined) {
      const next = defaultItemType(typeExplicit ? type : null, prefs);
      if (next !== type) send({ type: "SET_TYPE", itemType: next });
    }
    if (pinnedCellarId === undefined && cellars !== undefined) {
      send({
        type: "SET_CELLAR",
        cellarId: defaultCellarId(null, prefs, cellars),
      });
    }
  }, [chooseType, typeExplicit, resumeId, type, pinnedCellarId, cellars, send]);

  const handleOnComplete = useCallback(
    ({
      existingItemId,
      existingItemType,
      existingItemName,
      barcode,
      frontLabelDataUrl,
      displayImageDataUrl,
      declinedItemIds,
    }: OnboardingResult) => {
      rememberCapturePrefs({ mode: "bottle", itemType: context.itemType });
      send({
        type: "COMPLETE",
        barcode,
        frontLabel: frontLabelDataUrl,
        existingItemId,
        existingItemType,
        existingItemName,
        displayImageDataUrl,
        declinedItemIds,
      });
    },
    [send, context.itemType],
  );

  // "Keep going in the background" (X05), offered once the read has run
  // BACKGROUND_AFTER_MS from the shutter.
  const reading = includes(state.value, [
    "upload",
    "analyze",
    "retryAnalyze",
    "matching",
  ]);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!reading) return;
    const timer = setTimeout(() => setSlow(true), BACKGROUND_AFTER_MS);
    return () => clearTimeout(timer);
  }, [reading]);

  const keepGoingInBackground = () => {
    const id = context.itemOnboardingId;
    const label = itemTypeLabel(itemType).toLowerCase();
    const href = resumeHref(id, itemType);
    const tracked = captureDrafts.background(id, (draft) => {
      // A typed refusal (nothing read, a menu, a spent allowance) settles
      // "ready" too — with an outcome instead of a reading. Only a reading
      // is "read".
      const refusal =
        draft.settled.state === "ready"
          ? draft.settled.value.extractionError
          : undefined;
      if (draft.settled.state === "ready" && refusal === undefined) {
        notify(`Your ${label} is read`, {
          description: "The draft is waiting for you to check it.",
          undo: () => router.push(href),
          actionLabel: "Review",
          durationMs: 15_000,
        });
      } else if (refusal !== undefined) {
        notify(refusal.title, {
          description: `Your ${label} draft is waiting — ${
            refusal.kind === "looks-like-menu"
              ? "scan it as a menu, or retake it."
              : "fill the details in yourself."
          }`,
          undo: () => router.push(href),
          actionLabel: "Review",
          durationMs: 15_000,
        });
      } else {
        notify(`The ${label} label couldn't be read`, {
          description: "You can fill the details in yourself.",
          undo: () => router.push(href),
          actionLabel: "Fill it in",
          tone: "error",
          durationMs: 15_000,
        });
      }
    });
    if (!tracked) return;
    router.push(
      context.cellarId === undefined ? "/" : `/cellars/${context.cellarId}`,
    );
  };

  // Remember where bottles go, and forget the draft once it is filed.
  useEffect(() => {
    if (state.value !== "finalPrompt") return;
    captureDrafts.release(context.itemOnboardingId);
    // From any add path: the last cellar a bottle went into is the default
    // next time (here, on /add and on the item page's sheet).
    if (context.cellarId !== undefined) {
      rememberCapturePrefs({ cellarId: context.cellarId });
    }
  }, [state.value, context.itemOnboardingId, context.cellarId]);

  // Quick add files another bottle of the matched catalogue item (N02). It
  // creates nothing: the machine only reaches quickReview with a match.
  const { catalogMatch } = context;
  const handleQuickAddConfirm = useCallback(async (): Promise<
    string | undefined
  > => {
    send({ type: "CONFIRM" });
    return catalogMatch?.item.itemId;
  }, [catalogMatch, send]);
  const handleQuickAddEdit = useCallback(() => {
    send({ type: "EDIT" });
  }, [send]);

  const [backOpen, setBackOpen] = useState(false);
  const inCellar = isNotNil(context.cellarId);
  const cellarName =
    pinnedCellarName ??
    cellars?.find((cellar) => cellar.id === context.cellarId)?.name;
  const typeLabel = itemTypeLabel(itemType);
  const showCellarPicker =
    pinnedCellarId === undefined && cellars !== undefined && cellars.length > 0;

  const cellarRow = showCellarPicker ? (
    <CellarPicker
      cellars={cellars ?? []}
      value={context.cellarId ?? null}
      onValueChange={(cellarId) => send({ type: "SET_CELLAR", cellarId })}
    />
  ) : null;

  const stages: ShowcaseStage[] =
    context.frontLabel === undefined
      ? []
      : [
          {
            label: "Photo saved",
            state: state.value === "upload" ? "active" : "done",
          },
          {
            label: "Reading the label",
            state:
              state.value === "upload"
                ? "pending"
                : includes(state.value, ["analyze", "retryAnalyze"])
                  ? "active"
                  : "done",
          },
          {
            label: "Looking for it in your catalog",
            state: state.value === "matching" ? "active" : "pending",
          },
        ];

  const menuOutcome = context.extractionError?.kind === "looks-like-menu";

  // A draft resumed after a full reload has lost its capture; the session's
  // label file is its photo now (X06).
  const [{ data: storedPhoto }] = useQuery({
    query: CaptureFileUrlQuery,
    variables: { id: context.frontLabelFileId ?? "" },
    pause:
      context.frontLabel !== undefined ||
      context.frontLabelFileId === undefined,
  });
  const storedPhotoUrl = (() => {
    const file = unwrapResult(storedPhoto?.file, "File");
    return file.ok ? file.data.url : undefined;
  })();
  const labelPhoto = context.frontLabel ?? storedPhotoUrl;
  const displayPhoto =
    context.displayImageDataUrl ??
    (context.displayImageFileId !== undefined &&
    context.displayImageFileId === context.frontLabelFileId
      ? storedPhotoUrl
      : undefined);

  // X05/X06: the read said "menu" — Menu mode, with the same photo.
  const scanAsMenu = () => {
    const photo = context.frontLabel?.startsWith("data:")
      ? context.frontLabel
      : undefined;
    if (onScanAsMenu !== undefined) {
      onScanAsMenu(photo);
      return;
    }
    router.push(
      photo === undefined
        ? "/add?mode=menu"
        : captureHrefWithPhoto("menu", photoHandoff.put(photo)),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <CaptureHeader
        leading={leading}
        title={
          chooseType && state.value === "wizard"
            ? "Add a bottle"
            : `Add ${typeLabel}`
        }
      />

      {state.value === "wizard" && (
        <div className="flex w-full max-w-[600px] flex-col gap-3">
          {chooseType && (
            <TypePicker
              value={itemType}
              onValueChange={(next) => {
                send({ type: "SET_TYPE", itemType: next });
                rememberCapturePrefs({ itemType: next });
              }}
            />
          )}
          {carried !== undefined ? (
            <>
              <CapturePhotoPreview
                photo={carried}
                alt="Your label, as snapped"
                onRetake={() => setCarried(undefined)}
              >
                <Button
                  onClick={() =>
                    handleOnComplete({ frontLabelDataUrl: carried })
                  }
                >
                  <Scan aria-hidden />
                  Read this label
                </Button>
              </CapturePhotoPreview>
              {modeRow}
              <p className="text-center type-callout text-ink-2">
                Check the type above, then read the label — it lands in a draft
                you can fix.
              </p>
            </>
          ) : (
            <OnboardingWizard
              onComplete={handleOnComplete}
              itemType={itemType}
              inCellar={inCellar}
              belowCamera={modeRow}
            />
          )}
        </div>
      )}

      {reading && (
        <div className="flex w-full max-w-[600px] flex-col gap-3">
          {labelPhoto !== undefined && (
            <div className="flex items-center gap-3">
              {/* The photo stays in view from the shutter on: the read is
                  about *this* picture (design §5 moment 2, before its
                  dissolve). */}
              {/* biome-ignore lint/performance/noImgElement: the local capture (data URL), or its stored file's presigned URL. */}
              <img
                src={labelPhoto}
                alt="Your label, as snapped"
                className="h-16 w-12 shrink-0 rounded-md object-cover"
              />
              <TypeChip type={itemType} />
            </div>
          )}
          <AnimationShowcase
            statusText={
              context.frontLabel === undefined
                ? "Opening the form…"
                : state.value === "upload"
                  ? "Saving the photo…"
                  : state.value === "matching"
                    ? "Looking it up…"
                    : "Reading the label…"
            }
            stages={stages}
          >
            {slow && includes(state.value, ["analyze", "retryAnalyze"]) && (
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="type-callout text-ink-2">
                  Still reading — a label can take up to a minute. You
                  don&rsquo;t have to wait here.
                </p>
                <Button variant="secondary" onClick={keepGoingInBackground}>
                  Keep going in the background
                </Button>
              </div>
            )}
          </AnimationShowcase>
        </div>
      )}

      {includes(state.value, ["addItemToCellar", "uploadImage"]) && (
        <AnimationShowcase statusText="Adding your bottle…" />
      )}

      {state.value === "addFailed" && (
        <div className="w-full sm:w-1/2">
          <Alert variant="destructive">
            <ErrorIcon aria-hidden />
            <AlertDescription className="gap-2">
              <p>{context.error}</p>
              <Button onClick={() => send({ type: "RETRY" })}>Try again</Button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {state.value === "quickReview" && isNotNil(catalogMatch) && (
        <div className="flex w-full max-w-[600px] flex-col gap-3">
          <QuickAddCard
            heading="Is it this one?"
            // The card names the item it will file, in the catalogue's
            // words — not the label read's, and not its raw enum codes.
            defaults={{
              name: catalogMatch.item.name,
              vintage: catalogMatch.item.vintage,
              brand_name: catalogMatch.brandName,
            }}
            summary={catalogMatchSummary(catalogMatch)}
            itemType={itemType}
            confidence={context.confidence ?? 0}
            // "No cellar — just the catalog" chosen mid-countdown: the
            // match is used, with no bottle filed.
            confirmLabel={inCellar ? "+1 bottle" : "Use this"}
            editLabel="Not this one"
            onConfirm={handleQuickAddConfirm}
            onEdit={handleQuickAddEdit}
          >
            {/* Inside the card: touching it pauses the countdown. */}
            {cellarRow}
          </QuickAddCard>
        </div>
      )}

      {state.matches("form") && (
        <div data-slot="draft-card" className="flex flex-col gap-4">
          <div className="flex max-w-[600px] items-center gap-3">
            {labelPhoto !== undefined && (
              // biome-ignore lint/performance/noImgElement: the local capture (data URL), or its stored file's presigned URL.
              <img
                src={labelPhoto}
                alt="Your label, as snapped"
                className="h-20 w-15 shrink-0 rounded-md object-cover"
              />
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <p className="type-overline text-ink-3">Draft</p>
              <TypeChip type={itemType} />
            </div>
          </div>
          {cellarRow !== null && (
            <div className="max-w-[600px]">{cellarRow}</div>
          )}
          {isNotNil(context.error) && (
            <Alert className="max-w-[600px]">
              <Warning aria-hidden />
              <AlertDescription className="text-ink-1">
                <p>{context.error}</p>
              </AlertDescription>
            </Alert>
          )}
          {context.labelSent && isNotNil(context.extractionError) && (
            <div className="flex max-w-[600px] flex-col gap-2">
              <AiStatus outcome={context.extractionError} />
              {menuOutcome && (
                // X05: the label read said "menu" — at zero extra calls; X06:
                // Menu mode takes the same photo, no second shot.
                <div className="flex flex-wrap gap-2">
                  <Button onClick={scanAsMenu}>
                    <Scan aria-hidden />
                    Scan it as a menu
                  </Button>
                  <Button variant="ghost" onClick={onRestart}>
                    Retake
                  </Button>
                </div>
              )}
            </div>
          )}
          {isNotNil(context.catalogMatch) ? (
            <CatalogMatchPrompt
              match={context.catalogMatch}
              inCellar={inCellar}
              onUse={() => send({ type: "USE_MATCH" })}
              onDismiss={() => send({ type: "DISMISS_MATCH" })}
            />
          ) : (
            context.imageMatches.length > 0 && (
              <div className="flex max-w-[600px] flex-col gap-2">
                <MatchList
                  label="Looks like"
                  matches={context.imageMatches}
                  inCellar={inCellar}
                  onChoose={(item) => send({ type: "USE_IMAGE_MATCH", item })}
                />
                <Button
                  variant="ghost"
                  className="self-start"
                  onClick={() => send({ type: "DISMISS_IMAGE_MATCHES" })}
                >
                  None of these — it&rsquo;s new
                </Button>
              </div>
            )
          )}
          {context.labelSent && context.backLabelFileId === undefined && (
            <div className="flex max-w-[600px] flex-col gap-2">
              {state.matches({ form: "rereading" }) ? (
                <p
                  role="status"
                  className="flex items-center gap-2 type-callout text-ai"
                >
                  <Spinner aria-hidden className="size-4" />
                  Reading the back label…
                </p>
              ) : (
                <Button
                  variant="secondary"
                  className="self-start"
                  onClick={() => setBackOpen(true)}
                >
                  <Camera aria-hidden />
                  Add back label
                </Button>
              )}
            </div>
          )}
          {context.rereadError !== undefined && (
            <div className="max-w-[600px]">
              {typeof context.rereadError === "string" ? (
                <Alert>
                  <Warning aria-hidden />
                  <AlertDescription className="text-ink-1">
                    <p>{context.rereadError}</p>
                  </AlertDescription>
                </Alert>
              ) : (
                <AiStatus
                  outcome={{
                    ...context.rereadError,
                    title: "The back label wasn't read",
                  }}
                />
              )}
            </div>
          )}
          <OnboardingItemForm
            type={itemType}
            itemOnboardingId={context.itemOnboardingId}
            defaultValues={context.defaults ?? emptyDefaults()}
            refill={context.refill}
            sessionBarcode={scanned?.text}
            onCreated={(itemId, name) =>
              send({ type: "CREATED", itemId, name })
            }
          />
          <BottomSheet
            open={backOpen}
            onOpenChange={setBackOpen}
            title="Back label"
            description="It's read together with the front, into the fields you haven't filled."
          >
            <div className="pb-2">
              {backOpen && (
                <CaptureCamera
                  shutterLabel="Take a photo of the back label"
                  onCapture={(image) => {
                    setBackOpen(false);
                    send({ type: "BACK_LABEL", image });
                  }}
                />
              )}
            </div>
          </BottomSheet>
        </div>
      )}

      <SuccessSheet
        open={state.value === "finalPrompt"}
        itemType={itemType}
        itemName={context.itemName}
        cellarName={inCellar ? (cellarName ?? "your cellar") : undefined}
        photo={displayPhoto}
        imageError={context.imageError}
        onSnapAnother={() => send({ type: "SNAP_ANOTHER" })}
        onOpenNow={
          inCellar && isNotNil(context.cellarItemId)
            ? () => send({ type: "OPEN_NOW" })
            : undefined
        }
        onDone={() => {
          if (state.value === "finalPrompt") send({ type: "DONE" });
        }}
      />
    </div>
  );
};
