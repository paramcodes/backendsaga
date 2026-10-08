import { ArrowRight, X } from "lucide-react";
import type { Concept, Relationship } from "@/domain";
import { Button } from "@/components/ui/button";
import { RELATIONSHIP_MEANINGS, relationshipSentence } from "@/lib/graph-explore";
import { cn } from "@/lib/utils";

type Props = {
  relationship: Relationship;
  source: Concept;
  target: Concept;
  onSelect: (id: string) => void;
  onClose: () => void;
};

export function RelationshipInspector({ relationship, source, target, onSelect, onClose }: Props) {
  const meaning = RELATIONSHIP_MEANINGS[relationship.type];
  return (
    <aside
      aria-label="Relationship detail"
      className="absolute bottom-3 left-3 right-3 z-40 border border-border bg-popover/97 p-4 shadow-xl backdrop-blur md:bottom-5 md:left-1/2 md:right-auto md:w-[28rem] md:-translate-x-1/2"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Relationship</p>
          <p
            className={cn(
              "mt-1 font-mono text-[11px] uppercase tracking-wide",
              meaning.tone === "causal" && "text-[color:var(--graph-edge-warning)]",
              meaning.tone === "protective" && "text-[color:var(--graph-edge-positive)]",
              meaning.tone === "structural" && "text-muted-foreground",
            )}
          >
            {meaning.label}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label="Close relationship detail">
          <X />
        </Button>
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm">
        <button
          onClick={() => onSelect(source.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-primary"
        >
          <span className={`layer-dot layer-${source.layerId}`} />
          <span className="truncate font-display">{source.name}</span>
        </button>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        <button
          onClick={() => onSelect(target.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-primary"
        >
          <span className={`layer-dot layer-${target.layerId}`} />
          <span className="truncate font-display">{target.name}</span>
        </button>
      </div>

      <p className="mt-3 border-t border-border pt-3 text-sm leading-relaxed">
        {relationshipSentence(relationship.type, source.name, target.name)}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{meaning.summary}</p>
    </aside>
  );
}
