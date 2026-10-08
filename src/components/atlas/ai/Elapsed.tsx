import { useEffect, useState } from "react";

/**
 * A ticking "0:07" for a long call. Isolated in its own component so one
 * second of elapsed time does not re-render a streaming answer.
 */
export function Elapsed({ since, running }: { since: number | null; running: boolean }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running || since === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running, since]);

  if (since === null) return null;
  const seconds = Math.max(0, Math.round(((running ? now : Math.max(now, since)) - since) / 1000));
  const minutes = Math.floor(seconds / 60);

  return (
    <span className="font-mono text-[10px] tabular-nums uppercase tracking-widest text-muted-foreground">
      {minutes}:{String(seconds % 60).padStart(2, "0")}
    </span>
  );
}
