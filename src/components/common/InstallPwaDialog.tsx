import { BeforeInstallPromptEvent } from "@/constants";
import {
  Button,
  DialogContent,
  DialogTitle,
  Modal,
  ModalDialog,
  Stack,
} from "@mui/joy";
import { track } from "@vercel/analytics/react";
import { useEffect, useState } from "react";

export const InstallPwaDialog = () => {
  const [open, setOpen] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent>();

  useEffect(() => {
    const onBeforePrompt = (event: BeforeInstallPromptEvent) => {
      event.preventDefault();
      setInstallEvent(event);
      setOpen(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforePrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforePrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (installEvent !== undefined) {
      const result = await installEvent.prompt();
      track("install_pwa_result", result);
    }
    setOpen(false);
  };
  return (
    <Modal open={open} onClose={() => setOpen(false)}>
      <ModalDialog>
        <DialogTitle>Install Cellar Assistant</DialogTitle>
        <DialogContent>
          To get the full experience of cellar assistant we recommend installing
          it as an app.
        </DialogContent>
        <Stack gap={2} direction="row" justifyContent="flex-end">
          <Button variant="outlined" onClick={() => setOpen(false)}>
            No Thanks
          </Button>
          <Button onClick={handleInstallClick}>Install</Button>
        </Stack>
      </ModalDialog>
    </Modal>
  );
};
