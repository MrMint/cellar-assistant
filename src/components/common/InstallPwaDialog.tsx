import {
  Button,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  Modal,
  ModalDialog,
  Stack,
  Typography,
} from "@mui/joy";
import { track } from "@vercel/analytics/react";
import { isNil, isNotNil } from "ramda";
import { useEffect, useState } from "react";
import { BeforeInstallPromptEvent } from "@/constants";

// detect if the device is on iOS
const isIos = () => {
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
};
// check if the device is in standalone mode
const isInStandaloneMode = () => {
  return window.matchMedia("(display-mode: standalone)").matches;
};

export const InstallPwaDialog = () => {
  const [open, setOpen] = useState(false);
  const [ios, setIos] = useState(false);
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

  useEffect(() => {
    if (isInStandaloneMode() === false && isIos()) {
      setIos(true);
      setOpen(true);
    }
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
          <Typography>
            To get the full experience of cellar assistant we recommend
            installing it as an app. This will allow easy access from the home
            screen.
          </Typography>
          {isNil(installEvent) && ios && (
            <List marker="decimal">
              <ListItem>Make sure you are using safari browser.</ListItem>
              <ListItem>Tap the “share” icon.</ListItem>
              <ListItem>Tap on “Add to home screen”.</ListItem>
            </List>
          )}
        </DialogContent>
        <Stack gap={2} direction="row" justifyContent="flex-end">
          {isNil(installEvent) && (
            <Button onClick={() => setOpen(false)}>Ok</Button>
          )}
          {isNotNil(installEvent) && (
            <>
              <Button variant="outlined" onClick={() => setOpen(false)}>
                No Thanks
              </Button>
              <Button onClick={handleInstallClick}>Install</Button>
            </>
          )}
        </Stack>
      </ModalDialog>
    </Modal>
  );
};
