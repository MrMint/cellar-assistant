import { AppBar } from "@/components/app/AppBar";
import { LoadingShell } from "@/components/app/LoadingShell";
import { Page } from "@/components/app/Page";
import { TasteProfileBlocks } from "@/components/taste/TasteProfileView";

export default function Loading() {
  return (
    <LoadingShell label="your taste profile">
      <Page>
        <AppBar title="Taste profile" parent="/me" />
        <TasteProfileBlocks />
      </Page>
    </LoadingShell>
  );
}
