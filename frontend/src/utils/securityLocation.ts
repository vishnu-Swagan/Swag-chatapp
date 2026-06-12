import * as Location from "expo-location";

import { api } from "@/src/api/client";

// Logs sign-in location for account security. Uses GPS with user permission,
// silently falls back to IP-only logging server-side when GPS is unavailable
// or denied (the backend always records the request IP).
export async function logLocation(event: "signup" | "login"): Promise<void> {
  let coords: { lat: number; lng: number; accuracy: number | null } | null =
    null;
  try {
    const current = await Location.getForegroundPermissionsAsync();
    let granted = current.granted;
    if (!granted && current.canAskAgain) {
      const req = await Location.requestForegroundPermissionsAsync();
      granted = req.granted;
    }
    if (granted) {
      const pos = (await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise((resolve) => setTimeout(() => resolve(null), 6000)),
      ])) as Location.LocationObject | null;
      if (pos) {
        coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        };
      }
    }
  } catch {
    // Location denied/unavailable — IP fallback happens server-side.
  }
  try {
    await api("/security/location", {
      method: "POST",
      body: { event, ...(coords || {}) },
    });
  } catch {}
}
