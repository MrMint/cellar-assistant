"use client";

import {
  Button,
  Checkbox,
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
import type { BeforeInstallPromptEvent } from "@/constants";

const PWA_DISMISS_KEY = "pwa-install-dismissed";
const PWA_DISMISS_PERMANENT_KEY = "pwa-install-dismissed-permanently";
const REMIND_LATER_DAYS = 7;

const isIos = () => {
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
};

const isInStandaloneMode = () => {
  return window.matchMedia("(display-mode: standalone)").matches;
};

const isDismissedPermanently = (): boolean => {
  try {
    return localStorage.getItem(PWA_DISMISS_PERMANENT_KEY) === "true";
  } catch {
    return false;
  }
};

const isDismissedTemporarily = (): boolean => {
  try {
    const dismissedAt = localStorage.getItem(PWA_DISMISS_KEY);
    if (dismissedAt === null) return false;
    const dismissDate = new Date(dismissedAt);
    const now = new Date();
    const daysSinceDismiss =
      (now.getTime() - dismissDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceDismiss < REMIND_LATER_DAYS;
  } catch {
    return false;
  }
};

const shouldShowDialog = (): boolean => {
  if (isDismissedPermanently()) return false;
  if (isDismissedTemporarily()) return false;
  return true;
};

export const InstallPwaDialog = () => {
  const [open, setOpen] = useState(false);
  const [ios, setIos] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent>();

  useEffect(() => {
    const onBeforePrompt = (event: BeforeInstallPromptEvent) => {
      event.preventDefault();
      setInstallEvent(event);
      if (shouldShowDialog()) {
        setOpen(true);
        track("pwa_install_prompt_shown", { platform: "android" });
      }
    };
    window.addEventListener("beforeinstallprompt", onBeforePrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforePrompt);
    };
  }, []);

  useEffect(() => {
    if (!isInStandaloneMode() && isIos() && shouldShowDialog()) {
      setIos(true);
      setOpen(true);
      track("pwa_install_prompt_shown", { platform: "ios" });
    }
  }, []);

  useEffect(() => {
    navigator.storage?.persist();
  }, []);

  const handleDismiss = () => {
    try {
      if (dontShowAgain) {
        localStorage.setItem(PWA_DISMISS_PERMANENT_KEY, "true");
        track("pwa_install_dismissed", { type: "permanent" });
      } else {
        localStorage.setItem(PWA_DISMISS_KEY, new Date().toISOString());
        track("pwa_install_dismissed", { type: "remind_later" });
      }
    } catch {
      // localStorage unavailable
    }
    setOpen(false);
  };

  const handleInstallClick = async () => {
    if (installEvent !== undefined) {
      const result = await installEvent.prompt();
      track("pwa_install_result", result);
    }
    setOpen(false);
  };

  return (
    <Modal open={open} onClose={handleDismiss}>
      <ModalDialog>
        <DialogTitle>Install Cellar Assistant</DialogTitle>
        <DialogContent>
          <Typography>
            To get the full experience of Cellar Assistant we recommend
            installing it as an app. This will allow easy access from the home
            screen.
          </Typography>
          {isNil(installEvent) && ios && (
            <List marker="decimal">
              <ListItem>Make sure you are using Safari.</ListItem>
              <ListItem>
                Tap the share icon{" "}
                <Typography component="span" fontWeight="lg">
                  ⎋
                </Typography>{" "}
                at the bottom of the screen.
              </ListItem>
              <ListItem>
                Scroll down and tap{" "}
                <Typography component="span" fontWeight="lg">
                  &quot;Add to Home Screen&quot;
                </Typography>
                .
              </ListItem>
            </List>
          )}
        </DialogContent>
        <Stack gap={1}>
          <Checkbox
            label="Don't show this again"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            size="sm"
          />
          <Stack gap={2} direction="row" justifyContent="flex-end">
            {isNil(installEvent) && (
              <Button onClick={handleDismiss}>
                {dontShowAgain ? "Close" : "Remind me later"}
              </Button>
            )}
            {isNotNil(installEvent) && (
              <>
                <Button variant="outlined" onClick={handleDismiss}>
                  {dontShowAgain ? "No Thanks" : "Remind me later"}
                </Button>
                <Button onClick={handleInstallClick}>Install</Button>
              </>
            )}
          </Stack>
        </Stack>
      </ModalDialog>
    </Modal>
  );
};
