import type { Metadata } from "next";
import { AppBar } from "@/components/app/AppBar";
import { Page } from "@/components/app/Page";
import { MyProfileQuery } from "@/components/user/fragments";
import { SettingsView } from "@/components/user/SettingsView";
import { apiServerQuery } from "@/lib/api/urql-server";

export const metadata: Metadata = { title: "Settings" };

/**
 * `/me/settings` (Shell-Me, Settings): reached from the hub's gear and its
 * last row. The profile only feeds the Edit profile row; without it (a
 * session that ended mid-load) the rest of the page still works.
 */
export default async function SettingsPage() {
  const data = await apiServerQuery(MyProfileQuery);
  const profile =
    data.me === null
      ? null
      : {
          displayName: data.me.profile.displayName,
          avatarUrl: data.me.profile.avatarUrl ?? null,
        };
  return (
    <Page>
      <AppBar
        title={<h1 className="t-head truncate text-ink">Settings</h1>}
        parent="/me"
      />
      <SettingsView profile={profile} />
    </Page>
  );
}
