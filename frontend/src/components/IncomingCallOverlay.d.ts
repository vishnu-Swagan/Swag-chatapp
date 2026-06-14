import React from "react";

// Resolves the platform-split IncomingCallOverlay (.native / .web) for
// TypeScript. Metro picks the actual implementation at bundle time.
declare const IncomingCallOverlay: React.ComponentType;
export default IncomingCallOverlay;
