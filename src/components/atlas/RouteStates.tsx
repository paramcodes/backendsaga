import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useEffect } from "react";

import { reportLovableError } from "@/lib/lovable-error-reporting";

/**
 * Shown when a route loader cannot reach the atlas database. The copy stays
 * concrete: the page failed to load, here is what to do next.
 */
export function AtlasRouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
    reportLovableError(error, { boundary: "atlas_route_error" });
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-20 md:px-8">
      <p className="eyebrow">Interrupted</p>
      <h1 className="mt-3 font-display text-3xl md:text-4xl">The atlas didn’t load</h1>
      <p className="mt-4 text-muted-foreground">
        The knowledge base could not be read just now. Nothing is lost — it is a read-only library,
        so trying again is always safe.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          onClick={() => {
            void router.invalidate();
            reset();
          }}
          className="border border-foreground px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors hover:bg-accent"
        >
          Try again
        </button>
        <Link
          to="/"
          className="border border-border px-4 py-2 font-mono text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          Back to the dashboard
        </Link>
      </div>
    </div>
  );
}

/** Shown when a slug in the URL matches nothing in the library. */
export function AtlasNotFound({ what = "entry" }: { what?: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 md:px-8">
      <p className="eyebrow">Missing</p>
      <h1 className="mt-3 font-display text-3xl md:text-4xl">No such {what}</h1>
      <p className="mt-4 text-muted-foreground">
        The atlas has no {what} under that address. It may have been renamed, or the link may be a
        guess that didn’t land.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          to="/search"
          search={{}}
          className="border border-foreground px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors hover:bg-accent"
        >
          Search the atlas
        </Link>
        <Link
          to="/graph"
          search={{}}
          className="border border-border px-4 py-2 font-mono text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          Open the graph
        </Link>
      </div>
    </div>
  );
}
