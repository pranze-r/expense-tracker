"use client";

import { useEffect } from "react";
import { startSync } from "@/lib/sync";

export default function SyncProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const stop = startSync();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return stop;
  }, []);

  return <>{children}</>;
}