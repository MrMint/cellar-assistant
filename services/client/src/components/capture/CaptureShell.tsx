import { LoadingShell, ShellBlocks } from "@/components/app/LoadingShell";
import { Skeleton } from "@/components/ui/skeleton";
import { CaptureClose } from "./CaptureChrome";

/**
 * `/add`'s loading shell (X24 for X06): ＋ is a tap into the camera, so the
 * frame of the capture surface — Close, the picture, the mode row — is on
 * screen the moment the tap commits, while the server reads the cellars the
 * draft card offers. Close is live from the first frame.
 */
export function CaptureShell() {
  return (
    <LoadingShell
      label="the camera"
      className="mx-auto flex w-full max-w-[600px] flex-col gap-3"
    >
      <div className="flex min-h-11 items-center gap-1">
        <CaptureClose />
      </div>
      <ShellBlocks className="flex flex-col gap-3">
        <Skeleton className="aspect-[3/4] max-h-[64dvh] w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-md" />
      </ShellBlocks>
    </LoadingShell>
  );
}
