"use client";

import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { gesture } from "@/lib/motion";
import { BottomSheet } from "../BottomSheet";
import { ConfirmSheet } from "../ConfirmSheet";
import { Back, More } from "../icons";
import { notify } from "../notify";
import { AnchoredSheet } from "../overlays/AnchoredSheet";
import { DesktopPane } from "../overlays/DesktopPane";
import { GlassDisc } from "../overlays/GlassDisc";
import { KeyTooltip } from "../overlays/Kbd";
import { KeysList } from "../overlays/KeysDialog";
import { OfflineStripView } from "../overlays/OfflineStrip";
import { PermissionRequestBody } from "../overlays/PermissionRequest";
import { PullIndicator } from "../overlays/PullIndicator";
import { QuickLook, type QuickLookItem } from "../overlays/QuickLook";
import { ShareSheet, ShareSheetBody } from "../overlays/ShareSheet";
import { ResponsiveDialog } from "../ResponsiveDialog";

// Demo-seed names (services/actors/scripts/demo-seed-data.ts), never real data.
const ITEMS: readonly QuickLookItem[] = [
  {
    id: "w_ridge",
    title: "Ridge Lytton Springs",
    meta: "Red · Zinfandel · Ridge Vineyards",
    href: "/wines",
  },
  {
    id: "w_muga",
    title: "Muga Reserva Rioja",
    meta: "Red · Tempranillo · Bodegas Muga",
    href: "/wines",
  },
  {
    id: "w_cloudy",
    title: "Cloudy Bay Sauvignon Blanc",
    meta: "White · Sauvignon Blanc · Cloudy Bay",
    href: "/wines",
  },
];
const SHARE_URL = "https://cellar.example/tier-lists/demo";

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <figcaption className="t-cap text-ink-3">{label}</figcaption>
      <div className="rounded-lg border border-edge bg-surface-1 p-4 text-ink">
        {children}
      </div>
    </figure>
  );
}

function Opener({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <Button variant="outline" className="border-edge-2" onClick={onOpen}>
      {label}
    </Button>
  );
}

/**
 * Every overlay F2a owns, in its states (kit gallery, under its Dark/Light
 * switch): the drawn bodies inline, and a button for each live one so its
 * motion, Esc and back can be tried.
 */
export function OverlaysGallery() {
  const [open, setOpen] = useState<
    "sheet" | "confirm" | "dialog" | "look" | "share" | "popover" | null
  >(null);
  const [lookIndex, setLookIndex] = useState(0);
  const close = (next: boolean) => {
    if (!next) setOpen(null);
  };

  return (
    <TooltipProvider>
      <div data-slot="overlays-gallery" className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-2">
          <Opener label="Sheet" onOpen={() => setOpen("sheet")} />
          <Opener label="Confirm" onOpen={() => setOpen("confirm")} />
          <Opener label="Dialog" onOpen={() => setOpen("dialog")} />
          <Opener label="Quick look" onOpen={() => setOpen("look")} />
          <Opener label="Share" onOpen={() => setOpen("share")} />
          <AnchoredSheet
            open={open === "popover"}
            onOpenChange={(next) => setOpen(next ? "popover" : null)}
            title="Sort"
            trigger={
              <Button variant="outline" className="border-edge-2">
                Popover
              </Button>
            }
          >
            <p className="t-body px-2 pb-2 text-ink-2">
              A–Z, Rating, Recently added
            </p>
          </AnchoredSheet>
          <Opener
            label="Toast with Undo"
            onOpen={() =>
              notify("Removed from Home Cellar", { undo: () => {} })
            }
          />
          <Opener
            label="Toast"
            onOpen={() => notify("Saved", { tone: "success" })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Frame label="Offline strip · offline, back">
            <div className="flex flex-col gap-2">
              <OfflineStripView state="offline" />
              <OfflineStripView state="back" />
            </div>
          </Frame>
          <Frame label="Glass discs over a photo">
            <div className="flex h-32 items-start justify-between rounded-md bg-raised p-3">
              <GlassDisc aria-label="Back">
                <Back aria-hidden />
              </GlassDisc>
              <GlassDisc aria-label="More actions">
                <More aria-hidden />
              </GlassDisc>
            </div>
          </Frame>
          <Frame label="Pull to refresh · pulling, armed, refreshing">
            <div className="flex gap-4">
              {[
                { pull: gesture.pullPx / 2, armed: false, refreshing: false },
                { pull: gesture.pullPx, armed: true, refreshing: false },
                { pull: gesture.pullPx, armed: true, refreshing: true },
              ].map((state) => (
                <div
                  key={`${state.armed}-${state.refreshing}`}
                  className="relative h-28 flex-1 overflow-hidden rounded-md bg-raised"
                >
                  <PullIndicator state={state} />
                </div>
              ))}
            </div>
          </Frame>
          <Frame label="Tooltip with its key (hover, 400 ms)">
            <KeyTooltip label="Search everything" keys="/">
              <Button variant="outline" className="border-edge-2">
                Search
              </Button>
            </KeyTooltip>
          </Frame>
          <Frame label="Permission · camera ask, camera off">
            <div className="grid gap-6 sm:grid-cols-2">
              <PermissionRequestBody
                kind="camera"
                state="ask"
                onAction={() => {}}
                onQuiet={() => {}}
              />
              <PermissionRequestBody
                kind="camera"
                state="off"
                onAction={() => {}}
                onQuiet={() => {}}
              />
            </div>
          </Frame>
          <Frame label="Permission · location ask, location off">
            <div className="grid gap-6 sm:grid-cols-2">
              <PermissionRequestBody
                kind="location"
                state="ask"
                onAction={() => {}}
                onQuiet={() => {}}
              />
              <PermissionRequestBody
                kind="location"
                state="off"
                onAction={() => {}}
                onQuiet={() => {}}
              />
            </div>
          </Frame>
          <Frame label="Share with a code">
            <p className="t-title pb-1">Beers, ranked</p>
            <p className="t-body pb-3 text-ink-2">
              Share · friends can open it · 12 beers
            </p>
            <ShareSheetBody
              title="Beers, ranked"
              url={SHARE_URL}
              onSendToFriend={() => {}}
            />
          </Frame>
          <Frame label="Keys">
            <KeysList />
          </Frame>
        </div>

        <Frame label="Desktop pane · 440">
          <div className="flex h-[640px] justify-end overflow-hidden rounded-md bg-background">
            <DesktopPane
              open
              onClose={() => {}}
              title={ITEMS[0]?.title ?? ""}
              onNext={() => {}}
              onExpand={() => {}}
              more={
                <GlassDisc aria-label="More actions">
                  <More aria-hidden />
                </GlassDisc>
              }
            >
              <p className="t-title">{ITEMS[0]?.title}</p>
              <p className="t-body text-ink-2">{ITEMS[0]?.meta}</p>
            </DesktopPane>
          </div>
        </Frame>

        <BottomSheet
          open={open === "sheet"}
          onOpenChange={close}
          title="Sort"
          description="How the cellar is ordered."
        >
          <p className="t-body pb-4 text-ink-2">
            A–Z · Rating · Recently added
          </p>
        </BottomSheet>
        <ConfirmSheet
          open={open === "confirm"}
          onOpenChange={close}
          title="Delete Home Cellar?"
          description="Its 24 bottles go with it."
          confirmLabel="Delete"
          onConfirm={() => setOpen(null)}
        />
        <ResponsiveDialog
          open={open === "dialog"}
          onOpenChange={close}
          title="Rename"
          description="A dialog at 440 on desktop, a sheet on a phone."
        >
          <p className="t-body text-ink-2">Body</p>
        </ResponsiveDialog>
        <QuickLook
          open={open === "look"}
          onOpenChange={close}
          items={ITEMS}
          index={lookIndex}
          onIndexChange={setLookIndex}
        />
        <ShareSheet
          open={open === "share"}
          onOpenChange={close}
          title="Beers, ranked"
          subtitle="Share · friends can open it · 12 beers"
          url={SHARE_URL}
          onSendToFriend={() => setOpen(null)}
        />
      </div>
    </TooltipProvider>
  );
}
