import React, { useEffect, useState } from "react";
import { StreamVideo, StreamVideoClient } from "@stream-io/video-react-native-sdk";

import { fetchStreamCredentials } from "@/src/api/stream";
import IncomingCallOverlay from "@/src/components/IncomingCallOverlay";
import { useAuth } from "@/src/context/AuthContext";

// Native: connect a single StreamVideoClient once the user is authenticated and
// verified (mirrors SocketContext's gating). The client stays connected app-wide
// so incoming calls ring from anywhere — the ringing overlay lives inside
// <StreamVideo> so useCalls() has the right context.
export function StreamVideoProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const shouldRun = !!user?.verified;

  useEffect(() => {
    if (!shouldRun || !user) {
      setClient(null);
      return;
    }
    let cancelled = false;
    let created: StreamVideoClient | null = null;

    (async () => {
      try {
        const creds = await fetchStreamCredentials();
        if (cancelled) return;
        created = StreamVideoClient.getOrCreateInstance({
          apiKey: creds.api_key,
          user: {
            id: creds.user_id,
            name: user.username,
            image: user.profile_image_base64 || undefined,
          },
          token: creds.token,
        });
        if (!cancelled) setClient(created);
      } catch {
        // Calling unavailable (e.g. Stream not configured server-side).
        // The rest of the app keeps working; call buttons just won't connect.
      }
    })();

    return () => {
      cancelled = true;
      const c = created;
      created = null;
      setClient(null);
      c?.disconnectUser().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRun, user?.id]);

  if (!client) return <>{children}</>;
  return (
    <StreamVideo client={client}>
      {children}
      <IncomingCallOverlay />
    </StreamVideo>
  );
}
