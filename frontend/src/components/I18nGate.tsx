import React, { useEffect, useState } from "react";
import { initI18n } from "@/src/i18n";

/** Initialises i18n before children mount. */
export default function I18nGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initI18n().finally(() => setReady(true));
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}
