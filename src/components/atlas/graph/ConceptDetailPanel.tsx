import { Link } from "@tanstack/react-router";
import { ChevronRight, Maximize2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Concept, Evidence, Relationship } from "@/domain";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RELATIONSHIP_MEANINGS } from "@/lib/graph-explore";
import { EVIDENCE_KIND_META } from "@/lib/evidence-view";
import { cn } from "@/lib/utils";

export type NeighborEntry = { rel: Relationship; other: Concept; outgoing: boolean };

type Props = {
  concept: Concept;
  layerLabel: string;
  neighbors: NeighborEntry[];
  evidence: Evidence[];
  /** Signals are loaded per concept, so the panel says so instead of showing nothing. */
  evidencePending?: boolean;
  cursor: number;
  onCursorChange: (index: number) => void;
  onSelect: (id: string) => void;
  onInspect: (relationshipId: string) => void;
  onFocusHere: () => void;
};

export function ConceptDetailPanel({
  concept,
  layerLabel,
  neighbors,
  evidence,
  evidencePending = false,
  cursor,
  onCursorChange,
  onSelect,
  onInspect,
  onFocusHere,
}: Props) {
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    itemRefs.current[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor, concept.id]);

  const outgoing = neighbors.filter((entry) => entry.outgoing).length;

  return (
    <aside
      aria-label={`${concept.name} detail`}
      className="absolute bottom-3 left-3 right-3 z-20 flex max-h-[15rem] flex-col border border-border bg-popover/95 p-4 shadow-xl backdrop-blur md:bottom-auto md:left-auto md:right-5 md:top-5 md:max-h-[calc(100%-6.5rem)] md:w-[21rem] md:p-5"
    >
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 size-2.5 shrink-0 rounded-full layer-node layer-${concept.layerId}`} />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[9px] uppercase text-muted-foreground">{layerLabel}</p>
          <h2 className="mt-1 font-display text-xl leading-tight">{concept.name}</h2>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={onFocusHere}
              aria-label="Centre the graph on this concept"
            >
              <Maximize2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Centre the neighbourhood here · f</TooltipContent>
        </Tooltip>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{concept.description}</p>

      {(evidence.length > 0 || evidencePending) && (
        <div className="mt-3 hidden shrink-0 space-y-1.5 border-t border-border pt-3 md:block">
          <p className="eyebrow">Observable as</p>
          {evidencePending && (
            <div className="h-3 w-2/3 animate-pulse rounded-sm bg-muted" aria-hidden />
          )}
          {evidence.slice(0, 2).map((item) => (
            <div
              key={item.id}
              className={cn("flex items-center gap-2", `kind-${item.kind.toLowerCase()}`)}
            >
              <span className="evidence-kind shrink-0">{EVIDENCE_KIND_META[item.kind].short}</span>
              <span className="evidence-signal min-w-0 flex-1 truncate" title={item.signal}>
                {item.signal}
              </span>
            </div>
          ))}
          {evidence.length > 2 && (
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              + {evidence.length - 2} more signal{evidence.length - 2 === 1 ? "" : "s"}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-y border-border py-2 font-mono text-[10px] uppercase text-muted-foreground">
        <span>{neighbors.length} connections</span>
        <span>{outgoing} outgoing</span>
      </div>

      <div className="-mx-1 mt-2 min-h-0 flex-1 overflow-y-auto px-1">
        {neighbors.map((entry, index) => (
          <div
            key={entry.rel.id}
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
            onMouseEnter={() => onCursorChange(index)}
            className={cn(
              "group flex items-center gap-1 rounded-sm px-1",
              index === cursor && "bg-accent",
            )}
          >
            <button
              onClick={() => onInspect(entry.rel.id)}
              aria-label={`What ${RELATIONSHIP_MEANINGS[entry.rel.type].label} means here`}
              className="w-[4.5rem] shrink-0 py-1.5 text-left font-mono text-[8px] uppercase text-muted-foreground hover:text-primary hover:underline"
            >
              {entry.outgoing ? "" : "← "}
              {RELATIONSHIP_MEANINGS[entry.rel.type].label}
            </button>
            <button
              onClick={() => onSelect(entry.other.id)}
              className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-xs"
            >
              <span className={`layer-dot layer-${entry.other.layerId}`} />
              <span className="flex-1 truncate group-hover:text-primary">{entry.other.name}</span>
              <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
            </button>
          </div>
        ))}
      </div>

      <Button asChild className="mt-4 w-full shrink-0">
        <Link to="/concepts/$slug" params={{ slug: concept.slug }}>
          Read full entry <ChevronRight />
        </Link>
      </Button>
    </aside>
  );
}
