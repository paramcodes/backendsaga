import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import type { Concept, Symptom } from "@/domain";
import { EVIDENCE_TREND_META } from "@/lib/evidence-view";
import type { ChainRole } from "@/lib/incident-view";
import { cn } from "@/lib/utils";

export type ChainConceptNodeData = {
  concept: Concept;
  layerLabel: string;
  role: ChainRole;
};

export type ChainSymptomNodeData = { symptom: Symptom };

export type ChainConceptFlowNode = Node<ChainConceptNodeData, "chainConcept">;
export type ChainSymptomFlowNode = Node<ChainSymptomNodeData, "chainSymptom">;
export type ChainFlowNode = ChainConceptFlowNode | ChainSymptomFlowNode;

const ROLE_LABEL: Record<ChainRole, string> = {
  cause: "Candidate cause",
  link: "In the chain",
  observed: "Where you read it",
};

function ChainConceptNode({ data }: NodeProps<ChainConceptFlowNode>) {
  return (
    <div
      className={cn(
        "chain-node layer-node",
        `layer-${data.concept.layerId}`,
        data.role === "cause" && "chain-node-cause",
      )}
      title={data.concept.description}
    >
      <Handle type="target" position={Position.Left} className="atlas-handle" />
      <span className="atlas-node-dot" />
      <div className="min-w-0">
        <p className="truncate font-display text-sm font-medium">{data.concept.name}</p>
        <p className="mt-0.5 truncate font-mono text-[9px] uppercase text-muted-foreground">
          {ROLE_LABEL[data.role]} · {data.layerLabel}
        </p>
      </div>
      <Handle type="source" position={Position.Right} className="atlas-handle" />
    </div>
  );
}

function ChainSymptomNode({ data }: NodeProps<ChainSymptomFlowNode>) {
  const trend = EVIDENCE_TREND_META[data.symptom.trend];
  return (
    <div className="chain-node chain-node-symptom" title={data.symptom.description}>
      <Handle type="target" position={Position.Left} className="atlas-handle" />
      <span aria-hidden className="text-center text-sm leading-none text-muted-foreground">
        {trend.sign}
      </span>
      <div className="min-w-0">
        <p className="truncate font-display text-sm font-medium">{data.symptom.name}</p>
        <p className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground">
          {data.symptom.signal}
        </p>
      </div>
    </div>
  );
}

export const chainNodeTypes = { chainConcept: ChainConceptNode, chainSymptom: ChainSymptomNode };
