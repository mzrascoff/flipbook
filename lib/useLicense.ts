"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import {
  FREE_EXPORTS,
  exportsUsed,
  noteExport,
  storeLicense,
  storedLicense,
  subscribeToMeter,
  verifyLicense,
  type LicenseClaims,
} from "./license";

export type Gate = {
  /** Whether an export may start right now. */
  allowed: boolean;
  /** Free exports remaining; 0 once the meter is spent. */
  freeLeft: number;
  /** Valid license claims, or null while free. */
  license: LicenseClaims | null;
  /** Verifies and stores a pasted token. Resolves false for a bad one. */
  activate: (token: string) => Promise<boolean>;
  /** Records a finished export against the free meter. */
  recordExport: () => void;
};

export function useLicense(): Gate {
  const [license, setLicense] = useState<LicenseClaims | null>(null);

  /* The meter lives in localStorage; the server snapshot is 0, and the store
     re-reads after hydration (and whenever another tab exports). */
  const used = useSyncExternalStore(subscribeToMeter, exportsUsed, () => 0);

  useEffect(() => {
    const token = storedLicense();
    if (!token) return;
    let cancelled = false;
    verifyLicense(token).then((claims) => {
      if (!cancelled && claims) setLicense(claims);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activate = useCallback(async (token: string) => {
    const claims = await verifyLicense(token);
    if (!claims) return false;
    storeLicense(token);
    setLicense(claims);
    return true;
  }, []);

  return {
    allowed: Boolean(license) || used < FREE_EXPORTS,
    freeLeft: Math.max(0, FREE_EXPORTS - used),
    license,
    activate,
    recordExport: noteExport,
  };
}
