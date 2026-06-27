import { Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { authRequired, hasSession, signInWithPasscode } from "../../lib/auth";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";

interface PasscodeGateProps {
  children: React.ReactNode;
}

/**
 * Renders children once authenticated. In local mode (no Supabase) it passes
 * through immediately. In cloud mode it shows a single passcode field backed by the
 * shared Supabase login.
 */
export function PasscodeGate({ children }: PasscodeGateProps) {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authRequired) {
      setAuthed(true);
      setChecking(false);
      return;
    }
    void hasSession().then((ok) => {
      setAuthed(ok);
      setChecking(false);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await signInWithPasscode(passcode);
    setSubmitting(false);
    if (result.ok) {
      setAuthed(true);
    } else {
      setError(result.message);
      setPasscode("");
    }
  };

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-stone-400">
        Loading…
      </div>
    );
  }

  if (authed) return <>{children}</>;

  return (
    <div className="flex h-screen items-center justify-center bg-stone-50 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-amber-50 text-amber-700">
            <Lock className="size-5" aria-hidden />
          </span>
          <h1 className="text-lg font-semibold text-stone-900">DECANTVERSE</h1>
          <p className="text-sm text-stone-500">Enter the passcode to continue.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="passcode">Passcode</Label>
          <Input
            id="passcode"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="••••••••"
          />
          {error !== null && (
            <p className="text-xs text-red-500" role="alert">
              {error}
            </p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={submitting || passcode.trim() === ""}
        >
          {submitting ? "Checking…" : "Unlock"}
        </Button>
      </form>
    </div>
  );
}
