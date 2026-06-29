import { Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { authRequired, hasSession, signIn } from "../../lib/auth";
import { DEFAULT_LOGIN_EMAIL } from "../../lib/supabase";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";

interface PasscodeGateProps {
  children: React.ReactNode;
}

/**
 * Renders children once signed in. In local mode (no Supabase) it passes through
 * immediately. In cloud mode it shows an email + password login backed by Supabase
 * Auth — each person uses their own account.
 */
export function PasscodeGate({ children }: PasscodeGateProps) {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [email, setEmail] = useState(DEFAULT_LOGIN_EMAIL);
  const [password, setPassword] = useState("");
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
    const result = await signIn(email, password);
    setSubmitting(false);
    if (result.ok) {
      setAuthed(true);
    } else {
      setError(result.message);
      setPassword("");
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
          <p className="text-sm text-stone-500">Sign in to continue.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          disabled={submitting || email.trim() === "" || password === ""}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
