import { isSupabaseConfigured, supabase } from "./supabase";

/**
 * Multi-user auth: each person signs in with their own Supabase email + password.
 * Everyone who's signed in has full access (Row Level Security allows any
 * authenticated user). Sessions persist in the browser, so users stay logged in.
 */

/** Whether a login gate is needed at all (only in cloud mode). */
export const authRequired = isSupabaseConfigured;

export async function hasSession(): Promise<boolean> {
  if (!isSupabaseConfigured || supabase === null) return true;
  const { data } = await supabase.auth.getSession();
  return data.session !== null;
}

export async function getCurrentUserEmail(): Promise<string | null> {
  if (!isSupabaseConfigured || supabase === null) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isSupabaseConfigured || supabase === null) return { ok: true };
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) {
    // Surface the real reason ("Invalid login credentials", "Email not
    // confirmed", a key/URL problem, …) instead of a generic message.
    console.error("Supabase sign-in failed:", error);
    return { ok: false, message: `Login failed: ${error.message || "unknown error"}` };
  }
  return { ok: true };
}

export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured || supabase === null) return;
  await supabase.auth.signOut();
}
