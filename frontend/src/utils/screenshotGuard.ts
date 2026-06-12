import * as ScreenCapture from "expo-screen-capture";
import { Platform } from "react-native";

import { api } from "@/src/api/client";

/**
 * Activate screen-capture protection for the current screen.
 * - Android: fully blocks screenshots & screen recording (FLAG_SECURE).
 * - iOS: blacks out screen recording. Screenshots cannot be blocked but
 *   are detected via addScreenshotListener and reported to the backend
 *   (which notifies the other party in the chat).
 * Returns a cleanup function to call on unmount.
 */
export function activateScreenshotProtection(opts: {
  context: "chat" | "profile" | "image";
  chatWith?: string | null;
  messageId?: string | null;
  onScreenshot?: () => void;
}): () => void {
  let active = true;
  // Best-effort prevention (no-op on web)
  ScreenCapture.preventScreenCaptureAsync(`swag-${opts.context}`).catch(() => {});

  // Detection (iOS + Android both supported; iOS catches the OS screenshot gesture).
  const sub =
    Platform.OS !== "web"
      ? ScreenCapture.addScreenshotListener(() => {
          if (!active) return;
          opts.onScreenshot?.();
          api("/safety/screenshot", {
            method: "POST",
            body: {
              chat_with: opts.chatWith || null,
              message_id: opts.messageId || null,
              context: opts.context,
            },
          }).catch(() => {});
        })
      : null;

  return () => {
    active = false;
    try {
      sub?.remove();
    } catch {}
    ScreenCapture.allowScreenCaptureAsync(`swag-${opts.context}`).catch(() => {});
  };
}
