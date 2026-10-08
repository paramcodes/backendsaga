import { X } from "lucide-react";
import { RELATIONSHIP_TYPES, type Layer, type RelationshipType } from "@/domain";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { relationshipLabel } from "@/lib/graph-model";

type Props = {
  layers: Layer[];
  conceptCountByLayer: Record<string, number>;
  layerIds: ReadonlySet<string>;
  relationshipTypes: ReadonlySet<RelationshipType>;
  onToggleLayer: (id: string) => void;
  onToggleRelationship: (type: RelationshipType) => void;
  onAllLayers: () => void;
  onAllRelationships: () => void;
  onOnlyLayer: (id: string) => void;
  onClose: () => void;
};

export function GraphFiltersPanel({
  layers,
  conceptCountByLayer,
  layerIds,
  relationshipTypes,
  onToggleLayer,
  onToggleRelationship,
  onAllLayers,
  onAllRelationships,
  onOnlyLayer,
  onClose,
}: Props) {
  return (
    <aside
      aria-label="Graph filters"
      className="absolute left-3 top-3 z-30 max-h-[calc(100%-5.5rem)] w-[19rem] overflow-y-auto border border-border bg-popover p-4 shadow-xl md:left-5 md:top-5"
    >
      <div className="flex items-center justify-between">
        <p className="eyebrow">Graph filters</p>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label="Close graph filters">
          <X />
        </Button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase text-muted-foreground">Layers</p>
        <button onClick={onAllLayers} className="text-xs text-primary hover:underline">
          All
        </button>
      </div>
      <div className="mt-2 space-y-1">
        {layers.map((layer) => (
          <div key={layer.id} className="group flex items-center gap-2 text-sm">
            <Checkbox
              id={`layer-${layer.id}`}
              checked={layerIds.has(layer.id)}
              onCheckedChange={() => onToggleLayer(layer.id)}
            />
            <label htmlFor={`layer-${layer.id}`} className="flex flex-1 cursor-pointer items-center gap-2">
              <span className={`layer-dot layer-${layer.id}`} />
              <span className="flex-1 truncate">{layer.name}</span>
            </label>
            <button
              onClick={() => onOnlyLayer(layer.id)}
              className="font-mono text-[9px] uppercase text-muted-foreground opacity-0 transition-opacity hover:text-primary focus-visible:opacity-100 group-hover:opacity-100"
              aria-label={`Show only the ${layer.name} layer`}
            >
              only
            </button>
            <span className="w-5 text-right font-mono text-[9px] text-muted-foreground">
              {conceptCountByLayer[layer.id] ?? 0}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <p className="font-mono text-[10px] uppercase text-muted-foreground">Relationships</p>
        <button onClick={onAllRelationships} className="text-xs text-primary hover:underline">
          All
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
        {RELATIONSHIP_TYPES.map((type) => (
          <div key={type} className="flex items-center gap-2 text-[11px]">
            <Checkbox
              id={`rel-${type}`}
              checked={relationshipTypes.has(type)}
              onCheckedChange={() => onToggleRelationship(type)}
            />
            <label htmlFor={`rel-${type}`} className="cursor-pointer truncate">
              {relationshipLabel(type)}
            </label>
          </div>
        ))}
      </div>
    </aside>
  );
}
