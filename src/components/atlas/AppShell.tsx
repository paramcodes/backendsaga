import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import type { Layer } from "@/domain/schema";

const nav = [
  { to: "/", label: "Dashboard", num: "01" },
  { to: "/graph", label: "Knowledge Graph", num: "02" },
  { to: "/triage", label: "Triage", num: "03" },
  { to: "/incidents", label: "Incidents", num: "04" },
  { to: "/evidence", label: "Evidence", num: "05" },
  { to: "/library", label: "Library", num: "06" },
  { to: "/research", label: "Research", num: "07" },
  { to: "/learn", label: "Learn", num: "08" },
  { to: "/search", label: "Search", num: "09" },
] as const;

/** Layers come from the root route loader, which reads them from the database. */
export function AppShell({ children, layers }: { children: ReactNode; layers: Layer[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 overflow-y-auto border-r border-border bg-sidebar transition-transform md:static md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="border-b border-border px-6 py-6">
          <Link to="/" className="font-display text-2xl italic tracking-tight">
            Backend Atlas
          </Link>
          <p className="eyebrow mt-1">A field guide to systems</p>
        </div>
        <nav className="px-3 py-4">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              onClick={() => setOpen(false)}
              activeOptions={{ exact: n.to === "/" }}
              className="nav-link"
            >
              <span className="font-mono text-xs text-muted-foreground">{n.num}</span>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="px-6 pt-4">
          <p className="eyebrow mb-3">Layers</p>
          <ul className="space-y-1 text-sm">
            {layers.map((l) => (
              <li key={l.id}>
                <Link
                  to="/graph"
                  search={{ mode: "layer" as const, layer: l.id }}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 py-1 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span className={`layer-dot layer-${l.id}`} />
                  {l.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </aside>
      {open && (
        <button
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-foreground/20 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:px-8">
          <button
            aria-label="Open menu"
            className="rounded border border-border px-2 py-1 font-mono text-xs md:hidden"
            onClick={() => setOpen(true)}
          >
            MENU
          </button>
          <form
            className="flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              navigate({ to: "/search", search: { q } });
            }}
          >
            <input
              aria-label="Search concepts"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search concepts, mechanisms, symptoms…"
              className="w-full max-w-md border-b border-input bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </form>
          <Link
            to="/triage"
            className="hidden border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-foreground hover:text-foreground sm:block"
          >
            Start triage
          </Link>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
