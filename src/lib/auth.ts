import { isSupabaseConfigured, LOGIN_EMAIL, supabase } from "./supabase";

/**
 * "Shared passcode" auth: everyone signs in to ONE shared Supabase account. The
 * email is fixed (env), so the UI only asks for the password (the passcode). The
 * session is persisted by the Supabase client, so users don't re-enter it each visit.
 */

/** Whether a login gate is needed at all (only in cloud mode). */
export const authRequired = isSupabaseConfigured;

export async function hasSession(): Promise<boolean> {
  if (!isSupabaseConfigured || supabase === null) return true;
  const { data } = await supabase.auth.getSession();
  return data.session !== null;
}

export async function signInWithPasscode(
  passcode: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isSupabaseConfigured || supabase === null || LOGIN_EMAIL === "") {
    return { ok: true };
  }
  const { error } = await supabase.auth.signInWithPassword({
    email: LOGIN_EMAIL,
    password: passcode,
  });
  if (error) {
    // Surface the real reason — "Email not confirmed", "Invalid login
    // credentials", a key/URL problem, etc. — instead of always blaming the passcode.
    console.error("Supabase sign-in failed:", error);
    const detail = error.message || "Sign-in failed.";
    return { ok: false, message: `Login failed: ${detail}` };
  }
  return { ok: true };
}

export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured || supabase === null) return;
  await supabase.auth.signOut();
}
