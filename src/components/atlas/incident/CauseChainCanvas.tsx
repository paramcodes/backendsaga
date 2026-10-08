import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  useReactFlow,
  type Edge,
} from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Diagnosis, RankedCause } from "@/lib/incident-engine";
import { buildCauseChain, type CauseChain } from "@/lib/incident-view";
import { layoutDiagram } from "@/lib/graph-layout";
import { edgeAppearance } from "@/components/atlas/graph/edge-style";
import { chainNodeTypes, type ChainFlowNode } from "./ChainNodes";

import "@xyflow/react/dist/style.css";

type Props = {
  cause: RankedCause;
  diagnosis: Diagnosis;
  layerName: (layerId: string) => string;
};

const SYMPTOM_SIZE = { width: 208, height: 56 };
const CONCEPT_SIZE = { width: 192, height: 56 };

/**
 * One candidate, drawn as the chain that justifies it: cause on the left,
 * the signals you reported on the right. ELK owns every position.
 */
export function CauseChainCanvas({ cause, diagnosis, layerName }: Props) {
  const [nodes, setNodes] = useState<ChainFlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [height, setHeight] = useState(360);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const runRef = useRef(0);

  const chain = useMemo(() => buildCauseChain(cause, diagnosis), [cause, diagnosis]);

  useEffect(() => {
    const run = ++runRef.current;
    let cancelled = false;

    void (async () => {
      const positions = await layoutDiagram(
        chain.nodes.map((node) =>
          node.kind === "symptom"
            ? { id: node.id, ...SYMPTOM_SIZE }
            : { id: node.id, ...CONCEPT_SIZE },
        ),
        chain.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
        {
          "elk.layered.spacing.nodeNodeBetweenLayers": "88",
          "elk.spacing.nodeNode": "28",
        },
      );
      if (cancelled || run !== runRef.current) return;

      setHeight(frameHeight(chain, positions, frameRef.current?.clientWidth ?? 960));


      setNodes(
        chain.nodes.map((node, index) => {
          const position = positions.get(node.id) ?? { x: index * 240, y: index * 90 };
          return node.kind === "symptom"
            ? {
                id: node.id,
                type: "chainSymptom" as const,
                position,
                data: { symptom: node.symptom },
                draggable: false,
              }
            : {
                id: node.id,
                type: "chainConcept" as const,
                position,
                data: {
                  concept: node.concept,
                  layerLabel: layerName(node.concept.layerId),
                  role: node.role,
                },
                draggable: false,
              };
        }),
      );

      setEdges(
        chain.edges.map((edge) => {
          const appearance =
            edge.kind === "causal"
              ? edgeAppearance[edge.type]
              : { className: "graph-edge graph-edge-observation", dash: "4 4" };
          return {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            type: "default",
            className: appearance.className,
            ...(appearance.dash ? { style: { strokeDasharray: appearance.dash } } : {}),
            label: edge.kind === "causal" ? edge.type.toLowerCase() : "observed as",
            markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
          } satisfies Edge;
        }),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [chain, layerName]);

  return (
    <div
      ref={frameRef}
      style={{ height: `${height}px` }}
      className="relative w-full overflow-hidden border border-border bg-background"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={chainNodeTypes}
        className="atlas-flow"
        fitView
        fitViewOptions={{ padding: 0.08, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={1.6}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background className="atlas-background" gap={28} size={1} />
        <Controls showInteractive={false} position="bottom-right" />
        <FitOnChange signature={`${cause.concept.id}:${nodes.length}:${height}`} />
      </ReactFlow>
    </div>
  );
}

/**
 * The chain is wide and shallow, so a fixed-height canvas is mostly dead
 * space. Size the frame to what the layout actually needs at the zoom the
 * available width allows.
 */
function frameHeight(
  chain: CauseChain,
  positions: Map<string, { x: number; y: number }>,
  frameWidth: number,
): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of chain.nodes) {
    const position = positions.get(node.id);
    if (!position) continue;
    const size = node.kind === "symptom" ? SYMPTOM_SIZE : CONCEPT_SIZE;
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x + size.width);
    maxY = Math.max(maxY, position.y + size.height);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return 360;

  const contentWidth = Math.max(maxX - minX, 1);
  const contentHeight = Math.max(maxY - minY, 1);
  const zoom = Math.min(1, Math.max(0.2, (frameWidth - 48) / contentWidth));
  return Math.round(Math.min(620, Math.max(280, contentHeight * zoom + 110)));
}

/** Re-frames the canvas once a new chain has been laid out. */
function FitOnChange({ signature }: { signature: string }) {
  const flow = useReactFlow();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void flow.fitView({ padding: 0.08, maxZoom: 1, duration: 320 });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [flow, signature]);
  return null;
}
