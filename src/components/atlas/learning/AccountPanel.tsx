import { Link } from "@tanstack/react-router";

import { useAuth } from "@/hooks/use-auth";
import { useProgress } from "@/hooks/use-progress";

/** Where the reader's marks are kept, and how to move them to an account. */
export function AccountPanel({ touched }: { touched: number }) {
  const { user, loading } = useAuth();
  const { syncing, error, clearAll } = useProgress();

  return (
    <section className="learn-card p-5">
      <p className="eyebrow">Your marks</p>
      {loading ? (
        <p className="mt-2 h-4 w-40 animate-pulse bg-muted" aria-hidden />
      ) : user ? (
        <>
          <h2 className="mt-1 font-display text-xl tracking-tight">Synced to your account</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as {user.email ?? "your account"}. {touched} {touched === 1 ? "entry" : "entries"}{" "}
            marked, kept across devices.
          </p>
        </>
      ) : (
        <>
          <h2 className="mt-1 font-display text-xl tracking-tight">Saved in this browser</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {touched === 0
              ? "Nothing marked yet. Marks stay on this device until you create an account."
              : `${touched} ${touched === 1 ? "entry" : "entries"} marked on this device. Create an account and they move with you.`}
          </p>
        </>
      )}

      {syncing && <p className="mt-2 font-mono text-xs text-muted-foreground">Syncing…</p>}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/account" className="mastery-option">
          {user ? "Account" : "Sign in or sign up"}
        </Link>
        {touched > 0 && (
          <button
            type="button"
            className="mastery-option"
            onClick={() => {
              if (window.confirm("Clear every mark? This cannot be undone.")) clearAll();
            }}
          >
            Clear all marks
          </button>
        )}
      </div>
    </section>
  );
}
