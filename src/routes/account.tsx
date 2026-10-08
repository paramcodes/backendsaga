import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { useAuth } from "@/hooks/use-auth";
import { useProgress } from "@/hooks/use-progress";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Account — Backend Atlas" },
      {
        name: "description",
        content:
          "Optional account for Backend Atlas: keep what you have marked as understood across browsers and devices.",
      },
      { property: "og:title", content: "Account — Backend Atlas" },
      {
        property: "og:description",
        content: "Sign in to carry your reading progress between devices. The atlas itself is open to everyone.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccountRoute,
});

type Mode = "signin" | "signup";

function AccountRoute() {
  const { user, loading } = useAuth();
  const { progress, syncing, clearAll } = useProgress();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const marked = Object.keys(progress).length;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/account` },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setNotice("Check your inbox — confirm the address and you'll be signed in.");
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
      setPassword("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const withGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/account` },
      });
      if (oauthError) throw oauthError;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google sign-in is unavailable right now.");
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await supabase.auth.signOut();
      setNotice("Signed out. Your marks stay in this browser.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 md:px-8 md:py-16">
      <header className="mb-8">
        <p className="eyebrow">Account</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight">Carry your progress</h1>
        <p className="mt-3 text-muted-foreground">
          The atlas is open to read without an account. Signing in only does one thing: it keeps
          what you have marked as learned, understood or mastered so it follows you between
          browsers and devices.
        </p>
      </header>

      {loading ? (
        <div className="learn-card h-40 animate-pulse" aria-busy="true" />
      ) : user ? (
        <section className="learn-card p-6">
          <p className="eyebrow">Signed in</p>
          <h2 className="mt-1 font-display text-2xl tracking-tight">{user.email ?? "Your account"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {marked === 0
              ? "Nothing marked yet — your progress will appear here as you read."
              : `${marked} ${marked === 1 ? "entry" : "entries"} marked and synced.`}
            {syncing ? " Syncing…" : ""}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/learn" className="mastery-option">
              Go to learning
            </Link>
            <button type="button" className="mastery-option" disabled={busy} onClick={() => void signOut()}>
              Sign out
            </button>
            {marked > 0 && (
              <button
                type="button"
                className="mastery-option"
                onClick={() => {
                  if (window.confirm("Clear every mark on this account? This cannot be undone.")) {
                    clearAll();
                  }
                }}
              >
                Clear all marks
              </button>
            )}
          </div>
        </section>
      ) : (
        <section className="learn-card p-6">
          <div className="flex gap-2">
            {(["signin", "signup"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                onClick={() => {
                  setMode(option);
                  setError(null);
                  setNotice(null);
                }}
                className={cn("mastery-option", mode === option && "border-foreground text-foreground")}
              >
                {option === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form className="mt-5 space-y-4" onSubmit={(event) => void submit(event)}>
            <label className="block">
              <span className="eyebrow">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="eyebrow">Password</span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-primary"
              />
            </label>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {notice && <p className="text-sm text-muted-foreground">{notice}</p>}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={busy}
                className="border border-foreground bg-foreground px-3 py-1.5 font-mono text-xs uppercase tracking-widest text-background disabled:opacity-60"
              >
                {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
              </button>
              <button type="button" className="mastery-option" disabled={busy} onClick={() => void withGoogle()}>
                Continue with Google
              </button>
            </div>
          </form>

          {marked > 0 && (
            <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
              The {marked} {marked === 1 ? "mark" : "marks"} already in this browser will be merged into
              your account the moment you sign in. Nothing is lost either way.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
