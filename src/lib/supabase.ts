import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase is OPTIONAL. When the env vars are present the app runs in "cloud mode"
 * (hosted persistence + shared login). When they're absent it runs in "local mode"
 * (localStorage only, no login) — so the app still works for local dev and for
 * anyone who hasn't set up Supabase yet.
 *
 * The URL and anon key are meant to be public (they ship in the browser bundle);
 * Row Level Security + the shared login are what actually protect the data.
 */
// Defend against common .env paste mistakes: surrounding quotes, stray
// whitespace/newlines, and (for the URL) a trailing slash or path that would
// produce "Invalid path specified in request URL".
const clean = (v: string | undefined): string =>
  (v ?? "").trim().replace(/^["']|["']$/g, "").trim();

const url = clean(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, "");
const anonKey = clean(import.meta.env.VITE_SUPABASE_ANON_KEY);

/** Fixed account email — the UI only asks for the password ("passcode"). */
export const LOGIN_EMAIL = clean(import.meta.env.VITE_LOGIN_EMAIL);

export const isSupabaseConfigured =
  url.length > 0 && anonKey.length > 0 && LOGIN_EMAIL.length > 0;

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey)
  : null;

/** localStorage key + row id for the single app-state document. */
export const APP_STATE_TABLE = "app_state";
export const APP_STATE_ID = "singleton";
