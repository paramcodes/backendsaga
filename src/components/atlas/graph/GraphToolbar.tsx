import { Focus, Keyboard, Layers, Maximize, Network, Search, SlidersHorizontal, X } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { RankedConcept } from "@/lib/graph-explore";
import type { GraphMode } from "@/lib/graph-model";
import { MAX_DEPTH } from "@/lib/graph-explore";

type Props = {
  nodeCount: number;
  edgeCount: number;
  query: string;
  onQueryChange: (value: string) => void;
  matches: RankedConcept[];
  highlighted: number;
  onHighlightChange: (index: number) => void;
  onSelect: (id: string) => void;
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  layerLabelOf: (layerId: string) => string;
  mode: GraphMode;
  onModeChange: (mode: GraphMode) => void;
  depth: number;
  onDepthChange: (depth: number) => void;
  layerLabel?: string;
  onExitLayer: () => void;
  filtersOpen: boolean;
  onToggleFilters: () => void;
  activeFilterCount: number;
  onFit: () => void;
  onShortcuts: () => void;
};

export function GraphToolbar({
  nodeCount,
  edgeCount,
  query,
  onQueryChange,
  matches,
  highlighted,
  onHighlightChange,
  onSelect,
  searchOpen,
  onSearchOpenChange,
  searchRef,
  layerLabelOf,
  mode,
  onModeChange,
  depth,
  onDepthChange,
  layerLabel,
  onExitLayer,
  filtersOpen,
  onToggleFilters,
  activeFilterCount,
  onFit,
  onShortcuts,
}: Props) {
  return (
    <header className="border-b border-border px-4 py-3 md:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-[11rem]">
          <p className="eyebrow">Plate III · systems map</p>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h1 className="font-display text-2xl">Knowledge Graph</h1>
            <span className="font-mono text-[10px] text-muted-foreground">
              {nodeCount} nodes · {edgeCount} edges
            </span>
          </div>
        </div>

        <div className="relative order-3 w-full sm:order-none sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => {
              onQueryChange(event.target.value);
              onSearchOpenChange(true);
              onHighlightChange(0);
            }}
            onFocus={() => onSearchOpenChange(true)}
            onBlur={() => window.setTimeout(() => onSearchOpenChange(false), 120)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                onHighlightChange(matches.length === 0 ? 0 : (highlighted + 1) % matches.length);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                onHighlightChange(
                  matches.length === 0 ? 0 : (highlighted - 1 + matches.length) % matches.length,
                );
              } else if (event.key === "Enter") {
                event.preventDefault();
                const match = matches[highlighted] ?? matches[0];
                if (match) onSelect(match.concept.id);
              } else if (event.key === "Escape") {
                event.preventDefault();
                onQueryChange("");
                onSearchOpenChange(false);
                searchRef.current?.blur();
              }
            }}
            placeholder="Find a concept   /"
            aria-label="Find a concept in the graph"
            aria-expanded={searchOpen && matches.length > 0}
            role="combobox"
            aria-controls="graph-search-results"
            className="h-9 w-full rounded border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
          {searchOpen && query.trim().length > 0 && (
            <div
              id="graph-search-results"
              role="listbox"
              className="absolute left-0 right-0 top-11 z-50 max-h-[18rem] overflow-y-auto border border-border bg-popover p-1 shadow-lg"
            >
              {matches.length === 0 && (
                <p className="px-2 py-3 text-sm text-muted-foreground">No concept matches that.</p>
              )}
              {matches.map((match, index) => (
                <button
                  key={match.concept.id}
                  role="option"
                  aria-selected={index === highlighted}
                  onMouseEnter={() => onHighlightChange(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelect(match.concept.id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2 py-2 text-left text-sm",
                    index === highlighted ? "bg-accent" : "hover:bg-accent",
                  )}
                >
                  <span className={`layer-dot layer-${match.concept.layerId}`} />
                  <span className="flex-1 truncate">{match.concept.name}</span>
                  <span className="font-mono text-[9px] uppercase text-muted-foreground">
                    {match.matchedOn === "name" ? layerLabelOf(match.concept.layerId) : match.matchedOn}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {mode === "layer" && layerLabel && (
          <button
            onClick={onExitLayer}
            className="flex h-9 items-center gap-2 rounded border border-input bg-secondary px-3 text-xs"
            aria-label={`Leave the ${layerLabel} layer view`}
          >
            <Layers className="size-3.5" /> {layerLabel}
            <X className="size-3" />
          </button>
        )}

        <div className="flex h-9 rounded border border-input bg-muted p-0.5" role="group" aria-label="Graph scope">
          <button
            onClick={() => onModeChange("focus")}
            aria-pressed={mode === "focus"}
            className={cn(
              "flex items-center gap-1.5 rounded-sm px-3 text-xs",
              mode === "focus" && "bg-background shadow-sm",
            )}
          >
            <Focus className="size-3.5" /> Focus
          </button>
          <button
            onClick={() => onModeChange("atlas")}
            aria-pressed={mode === "atlas"}
            className={cn(
              "flex items-center gap-1.5 rounded-sm px-3 text-xs",
              mode === "atlas" && "bg-background shadow-sm",
            )}
          >
            <Network className="size-3.5" /> Atlas
          </button>
        </div>

        {mode === "focus" && (
          <div
            className="flex h-9 items-center gap-1 rounded border border-input bg-muted px-2"
            role="group"
            aria-label="Neighbourhood depth"
          >
            <span className="font-mono text-[9px] uppercase text-muted-foreground">Hops</span>
            {Array.from({ length: MAX_DEPTH }, (_, index) => index + 1).map((value) => (
              <button
                key={value}
                onClick={() => onDepthChange(value)}
                aria-pressed={depth === value}
                aria-label={`${value} hop${value > 1 ? "s" : ""} from the selected concept`}
                className={cn(
                  "size-6 rounded-sm font-mono text-[11px]",
                  depth === value ? "bg-background shadow-sm" : "text-muted-foreground",
                )}
              >
                {value}
              </button>
            ))}
          </div>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" onClick={onFit} aria-label="Fit the graph to the screen">
              <Maximize />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fit to screen · .</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={filtersOpen ? "secondary" : "outline"}
              size="icon"
              onClick={onToggleFilters}
              aria-label="Toggle graph filters"
              className="relative"
            >
              <SlidersHorizontal />
              {activeFilterCount > 0 && (
                <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-primary font-mono text-[9px] text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Filter layers and relationships · l</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" onClick={onShortcuts} aria-label="Keyboard shortcuts">
              <Keyboard />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Keyboard shortcuts · ?</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
