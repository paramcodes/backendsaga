import { ChevronRight, CornerUpLeft } from "lucide-react";
import type { Concept } from "@/domain";

type Props = {
  trail: Concept[];
  onSelect: (id: string) => void;
  onBack: () => void;
};

export function Breadcrumbs({ trail, onSelect, onBack }: Props) {
  if (trail.length === 0) return null;
  return (
    <nav
      aria-label="Exploration trail"
      className="pointer-events-auto absolute left-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] items-center gap-1 overflow-x-auto border border-border bg-popover/95 px-2 py-1.5 shadow-sm backdrop-blur md:left-5 md:top-5 md:max-w-[36rem]"
    >
      {trail.length > 1 && (
        <button
          onClick={onBack}
          aria-label="Back to the previous concept"
          className="mr-1 shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <CornerUpLeft className="size-3.5" />
        </button>
      )}
      {trail.map((concept, index) => (
        <span key={concept.id} className="flex shrink-0 items-center gap-1">
          {index > 0 && <ChevronRight className="size-3 text-muted-foreground" />}
          <button
            onClick={() => onSelect(concept.id)}
            aria-current={index === trail.length - 1 ? "page" : undefined}
            className={
              index === trail.length - 1
                ? "flex items-center gap-1.5 text-xs font-medium"
                : "flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            }
          >
            <span className={`layer-dot layer-${concept.layerId}`} />
            {concept.name}
          </button>
        </span>
      ))}
    </nav>
  );
}
