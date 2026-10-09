"use client";

import { useActor } from "@xstate/react";
import { usePathname, useRouter } from "next/navigation";
import { includes, isNotNil } from "ramda";
import { useCallback, useEffect, useRef, useState } from "react";
import { useClient } from "urql";
import { BottomSheet } from "@/components/app/BottomSheet";
import { EmptyState } from "@/components/app/EmptyState";
import {
  Camera,
  Cocktail,
  ErrorIcon,
  MapIcon,
  Scan,
  Warning,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { notify } from "@/components/app/notify";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { TypeChip } from "@/components/app/TypeChip";
import { CaptureCamera } from "@/components/capture/CaptureCamera";
import {
  type AddableCellar,
  CellarPicker,
} from "@/components/capture/CellarPicker";
import { captureDrafts } from "@/components/capture/drafts";
import { SuccessSheet } from "@/components/capture/SuccessSheet";
import { TypePicker } from "@/components/capture/TypePicker";
import {
  type ApiItemType,
  itemTypeLabel,
} from "@/components/cellar-api/itemTypes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  type CaptureMode,
  defaultCaptureMode,
  defaultCellarId,
  defaultItemType,
  readCapturePrefs,
  rememberCapturePrefs,
} from "@/lib/capture/capture-prefs";
import { BACKGROUND_AFTER_MS, draftIdFrom } from "@/lib/capture/draft-store";
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
  /** `/add`'s mode row: Bottle · Menu · Recipe, opening on the last used. */
  showModes?: boolean;
  /** The mode an entry asked for (`?mode=`), which wins over the last used. */
  mode?: CaptureMode;
  /** `?draft=<id>`: reopen a read left running in the background. */
  resumeId?: string;
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
      onRestart={restart}
    />
  );
};

const MODE_OPTIONS = [
  { value: "bottle", label: "Bottle", icon: <Camera aria-hidden /> },
  { value: "menu", label: "Menu", icon: <Scan aria-hidden /> },
  { value: "recipe", label: "Recipe", icon: <Cocktail aria-hidden /> },
] as const;

const ItemOnboardingRun = ({
  type,
  cellarId: pinnedCellarId,
  cellarName: pinnedCellarName,
  chooseType = false,
  typeExplicit = false,
  cellars,
  showModes = false,
  mode: explicitMode,
  resumeId,
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

  // Defaults that live in this browser (X05: last used, never a classifier),
  // applied after mount so the server render and hydration agree.
  const [mode, setMode] = useState<CaptureMode>(explicitMode ?? "bottle");
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    const prefs = readCapturePrefs();
    if (showModes) setMode(defaultCaptureMode(explicitMode, prefs));
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
  }, [
    showModes,
    explicitMode,
    chooseType,
    typeExplicit,
    resumeId,
    type,
    pinnedCellarId,
    cellars,
    send,
  ]);

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
      context.cellarId === undefined
        ? "/"
        : `/cellars/${context.cellarId}/items`,
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

  return (
    <div className="flex flex-col gap-4">
      <h1 className="type-title-2 text-ink-1">
        {chooseType && state.value === "wizard"
          ? "Add a bottle"
          : `Add ${typeLabel}`}
      </h1>

      {state.value === "wizard" && (
        <div className="flex w-full max-w-[600px] flex-col gap-3">
          {showModes && (
            <SegmentedControl
              aria-label="What are you capturing?"
              value={mode}
              options={MODE_OPTIONS}
              onValueChange={(next) => {
                setMode(next);
                rememberCapturePrefs({ mode: next });
              }}
            />
          )}
          {mode === "bottle" ? (
            <>
              {chooseType && (
                <TypePicker
                  value={itemType}
                  onValueChange={(next) => {
                    send({ type: "SET_TYPE", itemType: next });
                    rememberCapturePrefs({ itemType: next });
                  }}
                />
              )}
              <OnboardingWizard
                onComplete={handleOnComplete}
                itemType={itemType}
                inCellar={inCellar}
              />
            </>
          ) : mode === "menu" ? (
            <EmptyState
              illustration={<MapIcon aria-hidden className="size-10" />}
              title="Menus are read at their place."
              description="Find the bar or shop on the map, then scan its menu there."
              action={
                <Button asChild>
                  <Link href="/map" underline="none">
                    Find the place
                  </Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              illustration={<Cocktail aria-hidden className="size-10" />}
              title="Snap a recipe card."
              description="The drafter reads a photo, or a few words, into a recipe."
              action={
                <Button asChild>
                  <Link href="/recipes/ai-generator" underline="none">
                    Open the recipe drafter
                  </Link>
                </Button>
              }
            />
          )}
        </div>
      )}

      {reading && (
        <div className="flex w-full max-w-[600px] flex-col gap-3">
          {context.frontLabel !== undefined && (
            <div className="flex items-center gap-3">
              {/* The photo stays in view from the shutter on: the read is
                  about *this* picture (design §5 moment 2, before its
                  dissolve). */}
              {/* biome-ignore lint/performance/noImgElement: the local capture (data URL). */}
              <img
                src={context.frontLabel}
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
            {context.frontLabel !== undefined && (
              // biome-ignore lint/performance/noImgElement: the local capture (data URL).
              <img
                src={context.frontLabel}
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
                // X05: the label read said "menu" — at zero extra calls.
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link href="/map" underline="none">
                      Scan it as a menu
                    </Link>
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
        open={includes(state.value, ["finalPrompt", "openingNow"])}
        itemType={itemType}
        itemName={context.itemName}
        cellarName={inCellar ? (cellarName ?? "your cellar") : undefined}
        photo={context.displayImageDataUrl}
        imageError={context.imageError}
        opening={state.value === "openingNow"}
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
