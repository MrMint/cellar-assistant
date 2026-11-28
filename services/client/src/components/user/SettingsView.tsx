"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useMutation, useQuery } from "urql";
import { Check, ChevronRight, ICON_STROKE } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { UserAvatar } from "@/components/app/UserAvatar";
import { useGeolocation } from "@/components/map/hooks/useGeolocation";
import {
  isStandalone,
  openInstallSheet,
  useInstallOffer,
} from "@/components/pwa/install-offer";
import { Switch } from "@/components/ui/switch";
import { unwrapResult } from "@/lib/api/result";
import { feedback, useFeedbackSettings } from "@/lib/feedback";
import type { ThemeChoice } from "@/lib/theme";
import { useThemeChoice } from "@/lib/theme/client";
import { EditProfileSheet } from "./EditProfileSheet";
import {
  type CellarPrivacy,
  SetDefaultCellarPrivacyMutation,
  SettingsQuery,
  settingsFromResult,
  type Use,
} from "./me-hub-data";
import type { EditableProfile } from "./ProfileEditor";
import { SignOutButton } from "./SignOutButton";

const APPEARANCE = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "phone", label: "Phone" },
] as const satisfies readonly { value: ThemeChoice; label: string }[];

const HAPTICS = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
] as const;

/** One block of the settings card: a row of its own, rules between. */
function Block({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3 px-3.5 py-3">{children}</div>;
}

/** A label (2 to 4 words) over a subtitle (6 at most), a control at the right. */
function SwitchRow({
  id,
  label,
  subtitle,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  subtitle?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-3.5 py-2">
      <label htmlFor={id} className="flex min-w-0 flex-1 flex-col">
        <span className="t-body text-ink">{label}</span>
        {subtitle !== undefined && (
          <span className="t-cap text-ink-2">{subtitle}</span>
        )}
      </label>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

/** A whole-row button with a chevron (Edit profile, Install the app). */
function DoorRow({
  leading,
  label,
  subtitle,
  value,
  onPress,
}: {
  leading?: ReactNode;
  label: string;
  subtitle?: string;
  /** The current choice, in ink-2 before the chevron ("Friends"). */
  value?: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={() => feedback("press", { phase: "down" })}
      onPointerUp={() => feedback("press", { phase: "up" })}
      onClick={onPress}
      className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2 text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-act-ink active:bg-raised"
    >
      {leading}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="t-body truncate text-ink">{label}</span>
        {subtitle !== undefined && (
          <span className="t-cap truncate text-ink-2">{subtitle}</span>
        )}
      </span>
      {value !== undefined && (
        <span className="t-body shrink-0 text-ink-2">{value}</span>
      )}
      <ChevronRight
        aria-hidden
        className="size-5 shrink-0 text-glyph"
        strokeWidth={ICON_STROKE}
      />
    </button>
  );
}

/**
 * Use my location: on while the browser allows it. Turning it on asks
 * (the browser's own prompt, from this tap); a site's permission cannot be
 * taken back from a page, so turning it off says where that lives.
 */
function LocationRow() {
  const geo = useGeolocation();
  const on = geo.permission === "granted";
  const denied = geo.permission === "denied";
  return (
    <SwitchRow
      id="settings-location"
      label="Use my location"
      subtitle={
        denied ? "Off in your browser's settings" : "Distances and the map"
      }
      checked={on}
      disabled={geo.permission === "unsupported"}
      onCheckedChange={(next) => {
        if (next && !denied) {
          geo.request();
          return;
        }
        feedback("refuse");
        notify(
          next
            ? "Allow location in your browser's settings"
            : "Turn it off in your browser's settings",
        );
      }}
    />
  );
}

/** Who sees a new cellar (lot-cellars-shelves-03's three, each with its line). */
const PRIVACY: readonly {
  value: CellarPrivacy;
  label: string;
  note: string;
}[] = [
  { value: "PRIVATE", label: "Private", note: "Only you and co-owners" },
  { value: "FRIENDS", label: "Friends", note: "Your friends can look" },
  { value: "PUBLIC", label: "Public", note: "Anyone can look" },
];

/**
 * "Who sees your cellars" (FR-21, H-126): the account's default privacy for
 * the cellars made from now on. A row with the current choice, into a sheet
 * of the three. It writes `setDefaultCellarPrivacy` and nothing else: the
 * cellars that already exist keep their own privacy, and the sheet says so.
 */
function CellarPrivacyRow({ value }: { value: CellarPrivacy | null }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<CellarPrivacy | null>(null);
  const [{ fetching }, write] = useMutation(SetDefaultCellarPrivacyMutation);
  const current = chosen ?? value;
  const label = PRIVACY.find((option) => option.value === current)?.label;

  const choose = async (next: CellarPrivacy) => {
    if (next === current) {
      setOpen(false);
      return;
    }
    const result = unwrapResult(
      (await write({ privacy: next })).data?.setDefaultCellarPrivacy,
      "UserSettings",
    );
    if (!result.ok) {
      feedback("refuse");
      notify("Couldn't change who sees new cellars", { tone: "error" });
      return;
    }
    setChosen(result.data.defaultCellarPrivacy);
    feedback("success");
    setOpen(false);
  };

  return (
    <>
      <DoorRow
        label="Who sees your cellars"
        value={label}
        onPress={() => setOpen(true)}
      />
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title="Who sees your cellars"
        description="For new cellars. The ones you have keep their own."
      >
        <fieldset className="m-0 flex min-w-0 flex-col border-0 p-0 pb-2">
          <legend className="sr-only">Who sees your new cellars</legend>
          {PRIVACY.map((option) => {
            const selected = option.value === current;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                disabled={fetching}
                onPointerDown={() => feedback("press", { phase: "down" })}
                onPointerUp={() => feedback("press", { phase: "up" })}
                onClick={() => {
                  feedback("tick");
                  void choose(option.value);
                }}
                className="flex min-h-14 w-full items-center gap-3 rounded-md px-1 text-left outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring active:bg-raised disabled:opacity-60"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="t-body text-ink">{option.label}</span>
                  <span className="t-cap text-ink-2">{option.note}</span>
                </span>
                {selected && (
                  <Check
                    aria-hidden
                    className="size-5 shrink-0 text-act-ink"
                    strokeWidth={ICON_STROKE}
                  />
                )}
              </button>
            );
          })}
        </fieldset>
      </ResponsiveDialog>
    </>
  );
}

/**
 * Usage (FR-22, H-132): this month's AI use and Places use side by side, so
 * a "Limit reached" anywhere has a visible reason. Left out until read, and
 * when there is neither.
 */
function UsageRow({
  usage,
}: {
  usage: { ai: Use | null; places: Use | null };
}) {
  const parts = [
    { key: "ai", label: "AI", use: usage.ai },
    { key: "places", label: "Places", use: usage.places },
  ].filter((part) => part.use !== null);
  if (parts.length === 0) return null;
  return (
    <div
      data-slot="settings-usage"
      className="flex min-h-14 items-center gap-3 px-3.5 py-2"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="t-body text-ink">Usage</span>
        <span className="t-cap text-ink-2">This month</span>
      </span>
      <dl className="m-0 flex shrink-0 gap-4">
        {parts.map(({ key, label, use }) => (
          <div key={key} className="flex flex-col items-end">
            <dt className="t-cap text-ink-2">{label}</dt>
            <dd
              className={`t-body tabular m-0 ${
                use !== null && use.used >= use.limit
                  ? "text-danger"
                  : "text-ink"
              }`}
            >
              {use === null ? "" : `${use.used} of ${use.limit}`}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * `/me/settings` (Shell-Me, Settings): everything about the app rather than
 * the collection, in one card. Appearance writes the theme through MC-theme
 * (the `theme` cookie the pre-paint script reads, L45); Sounds and Haptics
 * through MC-feedback, on this device. Who sees your cellars and Usage are
 * the account's (one read, `SettingsQuery`). Sign out is last.
 */
export function SettingsView({ profile }: { profile: EditableProfile | null }) {
  const [theme, setTheme] = useThemeChoice();
  const sound = useFeedbackSettings();
  const install = useInstallOffer();
  const [editing, setEditing] = useState(false);
  const [settingsRead] = useQuery({ query: SettingsQuery });
  const settings = settingsFromResult(settingsRead.data);
  // Where the browser can't install the app the row stays, with how to do it
  // by hand (H-93); it goes only once the app is installed. After mount, so
  // the server's markup and the first client render agree.
  const [installed, setInstalled] = useState(true);
  useEffect(() => setInstalled(isStandalone(window)), []);

  return (
    <>
      <div className="flex flex-col divide-y divide-rule overflow-hidden rounded-md border border-edge bg-card">
        {profile !== null && (
          <DoorRow
            leading={
              <UserAvatar
                aria-hidden
                avatarUrl={profile.avatarUrl}
                displayName={profile.displayName}
                size="md"
              />
            }
            label="Edit profile"
            subtitle="Name and picture"
            onPress={() => setEditing(true)}
          />
        )}
        <Block>
          <span id="settings-appearance" className="t-body text-ink">
            Appearance
          </span>
          <SegmentedControl
            aria-label="Appearance"
            options={APPEARANCE}
            value={theme}
            cue="detent"
            onValueChange={setTheme}
          />
        </Block>
        <div className="flex flex-col">
          <h2 className="t-head m-0 px-3.5 pt-3 text-ink">Sound and haptics</h2>
          <SwitchRow
            id="settings-sounds"
            label="Sounds"
            subtitle="Follow the iPhone's silent switch"
            checked={sound.sounds}
            onCheckedChange={(sounds) => sound.set({ sounds })}
          />
        </div>
        <Block>
          <span className="t-body text-ink">Haptics</span>
          <SegmentedControl
            aria-label="Haptics"
            options={HAPTICS}
            value={sound.haptics ? "on" : "off"}
            onValueChange={(value) => sound.set({ haptics: value === "on" })}
          />
        </Block>
        <LocationRow />
        <CellarPrivacyRow value={settings.defaultCellarPrivacy} />
        {install.kind !== null ? (
          <DoorRow
            label="Install the app"
            subtitle="Opens full screen, like any app"
            onPress={openInstallSheet}
          />
        ) : (
          !installed && (
            <div className="flex min-h-14 flex-col justify-center px-3.5 py-2">
              <span className="t-body text-ink">Install the app</span>
              <span className="t-cap text-ink-2">
                In your browser's menu, choose Install or Add to Home Screen
              </span>
            </div>
          )
        )}
        <UsageRow usage={settings.usage} />
        <SignOutButton />
      </div>
      {profile !== null && (
        <EditProfileSheet
          open={editing}
          onOpenChange={setEditing}
          profile={profile}
        />
      )}
    </>
  );
}
