import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { loadPrefs, savePrefs } from "../lib/prefs";
import { fetchCatalog, loadCachedCatalog, saveCatalog } from "../lib/sheet";
import type { DecantCatalog } from "../types";

/**
 * Offline-first catalog hook: hydrate from the localStorage cache immediately,
 * then refresh from the Google Sheet in the background. A failed refresh keeps
 * the cached copy and surfaces a toast rather than breaking the page.
 */
export function useCatalog() {
  const initialPrefs = loadPrefs();
  const [sheetId, setSheetId] = useState(initialPrefs.sheetId);
  const [gid, setGid] = useState(initialPrefs.sheetGid);
  const [catalog, setCatalog] = useState<DecantCatalog | null>(() =>
    loadCachedCatalog(),
  );
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didInitialRefresh = useRef(false);

  const refresh = useCallback(
    async (id: string = sheetId, g: string = gid): Promise<boolean> => {
      setSyncing(true);
      setError(null);
      try {
        const fresh = await fetchCatalog(id, g);
        setCatalog(fresh);
        saveCatalog(fresh);
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to refresh prices.";
        setError(msg);
        toast.error(`Couldn't refresh prices — showing last synced copy. (${msg})`);
        return false;
      } finally {
        setSyncing(false);
      }
    },
    [sheetId, gid],
  );

  // Background refresh once on mount.
  useEffect(() => {
    if (didInitialRefresh.current) return;
    didInitialRefresh.current = true;
    void refresh();
  }, [refresh]);

  const setSheetConfig = useCallback(
    (id: string, g: string): void => {
      setSheetId(id);
      setGid(g);
      savePrefs({ sheetId: id, sheetGid: g });
      void refresh(id, g);
    },
    [refresh],
  );

  return {
    catalog,
    lastSynced: catalog?.lastSynced ?? null,
    syncing,
    error,
    refresh,
    setSheetConfig,
    sheetId,
    gid,
  };
}
