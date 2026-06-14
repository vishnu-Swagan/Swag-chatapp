import React from "react";

import IncomingCallOverlay from "@/src/components/IncomingCallOverlay";

// Web keeps the manual-WebRTC call path (signaled over our WebSocket), so no
// Stream client is created here. We still render the incoming-call overlay,
// which on web is driven by SocketContext.
export function StreamVideoProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <IncomingCallOverlay />
    </>
  );
}
