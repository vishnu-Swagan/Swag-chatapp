import React from "react";

// Resolves the platform-split CallRoom (CallRoom.native.tsx / CallRoom.web.tsx)
// for TypeScript. Metro picks the actual implementation at bundle time.
declare const CallRoom: React.ComponentType;
export default CallRoom;
