import React from "react";

// Resolves the platform-split StreamVideoProvider (.native / .web) for
// TypeScript. Metro picks the actual implementation at bundle time.
export declare function StreamVideoProvider(props: {
  children: React.ReactNode;
}): React.ReactElement;
