import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { Concept } from "@/domain";
import { cn } from "@/lib/utils";

export type AtlasNodeData = {
  concept: Concept;
  layerLabel: string;
  connections: number;
  hop: number;
  focused: boolean;
  dimmed: boolean;
};

export type AtlasNode = Node<AtlasNodeData, "atlas">;

export function ConceptNode({ data }: NodeProps<AtlasNode>) {
  return (
    <div
      className={cn(
        "atlas-node layer-node",
        `layer-${data.concept.layerId}`,
        data.focused && "atlas-node-focused",
        data.hop === 1 && "atlas-node-near",
        data.hop >= 2 && "atlas-node-far",
        data.dimmed && "atlas-node-dimmed",
      )}
      title={data.concept.description}
    >
      <Handle type="target" position={Position.Left} className="atlas-handle" />
      <span className="atlas-node-dot" />
      <div className="min-w-0">
        <p className="truncate font-display text-sm font-medium">{data.concept.name}</p>
        <p className="mt-0.5 truncate font-mono text-[9px] uppercase text-muted-foreground">
          {data.layerLabel} · {data.connections} links
        </p>
      </div>
      <Handle type="source" position={Position.Right} className="atlas-handle" />
    </div>
  );
}

export const nodeTypes = { atlas: ConceptNode };
