import type { InventoryStore } from "../types";
import { loadStore, normalizeStore, saveStore } from "./storage";
import {
  APP_STATE_ID,
  APP_STATE_TABLE,
  isSupabaseConfigured,
  supabase,
} from "./supabase";

/**
 * Persistence facade. In cloud mode the whole InventoryStore lives as one jsonb row
 * in Supabase, with localStorage kept as an offline cache. In local mode it's just
 * localStorage (see storage.ts). The app logic is unchanged either way.
 */

/** Load the inventory: from Supabase if configured (falling back to the local cache
 * on any error), otherwise straight from localStorage. */
export async function loadInventory(): Promise<InventoryStore> {
  if (!isSupabaseConfigured || supabase === null) {
    return loadStore();
  }
  try {
    const { data, error } = await supabase
      .from(APP_STATE_TABLE)
      .select("data")
      .eq("id", APP_STATE_ID)
      .maybeSingle();
    if (error) throw error;

    if (data?.data != null) {
      const store = normalizeStore(data.data as Partial<InventoryStore>);
      saveStore(store); // refresh offline cache
      return store;
    }

    // No remote row yet — seed it from whatever is local (real data or the seed set).
    const local = loadStore();
    await supabase
      .from(APP_STATE_TABLE)
      .upsert({ id: APP_STATE_ID, data: local, updated_at: new Date().toISOString() });
    return local;
  } catch (e) {
    console.warn("Supabase load failed — using local cache.", e);
    return loadStore();
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: InventoryStore | null = null;

function upsertNow(store: InventoryStore): void {
  if (!isSupabaseConfigured || supabase === null) return;
  void supabase
    .from(APP_STATE_TABLE)
    .upsert({ id: APP_STATE_ID, data: store, updated_at: new Date().toISOString() })
    .then(({ error }) => {
      if (error) console.warn("Supabase save failed (kept local copy).", error);
    });
}

/** Push any debounced-but-not-yet-sent change to Supabase immediately. Called when
 * the tab is hidden/closing so a last-second edit isn't lost in the debounce window. */
export function flushPendingSave(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const toSave = pending;
  pending = null;
  if (toSave !== null) upsertNow(toSave);
}

/** Save the inventory: cache to localStorage immediately, then debounce-upsert to
 * Supabase (cloud mode only). */
export function saveInventory(store: InventoryStore): void {
  saveStore(store); // immediate, synchronous offline cache

  if (!isSupabaseConfigured || supabase === null) return;

  pending = store;
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const toSave = pending;
    pending = null;
    saveTimer = null;
    if (toSave !== null) upsertNow(toSave);
  }, 800);
}

// Flush a pending save when the page is backgrounded or closing (covers the
// debounce gap). visibilitychange→hidden is the reliable signal on mobile + desktop.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingSave();
  });
  window.addEventListener("pagehide", () => flushPendingSave());
}
