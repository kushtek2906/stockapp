import type { InventoryStore } from "../types";
import { loadStore, mergeStores, normalizeStore, saveStore } from "./storage";
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
 *
 * Sync is non-destructive: every write is guarded by the row's `updated_at`
 * (optimistic concurrency). If another device/tab changed the row since we last
 * read it, we re-read and MERGE (union orders/sales/etc.) instead of overwriting —
 * so a stale client can never wipe another device's orders.
 */

/** The `updated_at` we last observed on the remote row — our concurrency token. */
let lastUpdatedAt: string | null = null;
/** Notifies the app when a merge pulled in remote changes, so the UI/state updates. */
let onExternalUpdate: ((store: InventoryStore) => void) | null = null;

export function setOnStoreUpdate(cb: ((store: InventoryStore) => void) | null): void {
  onExternalUpdate = cb;
}

/** Load the inventory: from Supabase if configured (falling back to the local cache
 * on any error), otherwise straight from localStorage. */
export async function loadInventory(): Promise<InventoryStore> {
  if (!isSupabaseConfigured || supabase === null) {
    return loadStore();
  }
  try {
    const { data, error } = await supabase
      .from(APP_STATE_TABLE)
      .select("data, updated_at")
      .eq("id", APP_STATE_ID)
      .maybeSingle();
    if (error) throw error;

    if (data?.data != null) {
      const store = normalizeStore(data.data as Partial<InventoryStore>);
      saveStore(store); // refresh offline cache
      lastUpdatedAt = (data.updated_at as string | null) ?? null;
      return store;
    }

    // No remote row yet — seed it from whatever is local (real data or the seed set).
    const local = loadStore();
    const ts = new Date().toISOString();
    await supabase
      .from(APP_STATE_TABLE)
      .upsert({ id: APP_STATE_ID, data: local, updated_at: ts });
    lastUpdatedAt = ts;
    return local;
  } catch (e) {
    console.warn("Supabase load failed — using local cache.", e);
    return loadStore();
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: InventoryStore | null = null;

async function upsertNow(store: InventoryStore): Promise<void> {
  if (!isSupabaseConfigured || supabase === null) return;
  try {
    // Fast path: a version-guarded update. Succeeds only if nobody else wrote
    // since we last read — so this device's edits (incl. deletes) apply cleanly.
    if (lastUpdatedAt !== null) {
      const ts = new Date().toISOString();
      const { data, error } = await supabase
        .from(APP_STATE_TABLE)
        .update({ data: store, updated_at: ts })
        .eq("id", APP_STATE_ID)
        .eq("updated_at", lastUpdatedAt)
        .select("updated_at");
      if (error) throw error;
      if (data && data.length > 0) {
        lastUpdatedAt = (data[0].updated_at as string) ?? ts;
        saveStore(store);
        return;
      }
      // 0 rows → someone else wrote (or row missing). Fall through to merge.
    }

    // Merge path: re-read the current remote and union it with our store so no
    // additions are lost, then write the merged result.
    const { data: row, error: readErr } = await supabase
      .from(APP_STATE_TABLE)
      .select("data, updated_at")
      .eq("id", APP_STATE_ID)
      .maybeSingle();
    if (readErr) throw readErr;

    const remote =
      row?.data != null
        ? normalizeStore(row.data as Partial<InventoryStore>)
        : null;
    // normalizeStore re-runs the cost-link reconcile so a merge can't leave
    // duplicate or diverged cost/price rows behind.
    const merged =
      remote !== null ? normalizeStore(mergeStores(remote, store)) : store;
    const ts = new Date().toISOString();
    const { data: written, error: writeErr } = await supabase
      .from(APP_STATE_TABLE)
      .upsert({ id: APP_STATE_ID, data: merged, updated_at: ts })
      .select("updated_at");
    if (writeErr) throw writeErr;

    lastUpdatedAt = (written?.[0]?.updated_at as string) ?? ts;
    saveStore(merged);
    // If the merge pulled in rows our in-memory state didn't have, surface them
    // so the next edit builds on the union (and the user sees them).
    if (remote !== null && onExternalUpdate !== null) onExternalUpdate(merged);
  } catch (e) {
    console.warn("Supabase save failed (kept local copy).", e);
  }
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
  if (toSave !== null) void upsertNow(toSave);
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
    if (toSave !== null) void upsertNow(toSave);
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
