import type { Severity } from "@/domain";
import { SEVERITY_META } from "@/lib/incident-view";
import { cn } from "@/lib/utils";

export function SeverityBadge({
  severity,
  className,
}: {
  severity: Severity;
  className?: string | undefined;
}) {
  const meta = SEVERITY_META[severity];
  return (
    <span className={cn("severity-badge", meta.className, className)} title={meta.blurb}>
      {meta.label}
    </span>
  );
}
