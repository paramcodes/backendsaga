import "@xyflow/react/dist/style.css";

import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RELATIONSHIP_TYPES, type RelationshipType } from "@/domain/schema";
import { createGraphIndex } from "@/domain/graph-index";
import type { AtlasGraphPayload } from "@/lib/atlas.functions";
import { conceptEvidenceQuery } from "@/lib/atlas-queries";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { appendTrail, rankConcepts } from "@/lib/graph-explore";
import { buildGraphView, type GraphMode } from "@/lib/graph-model";
import { layoutGraph, type PositionedConcept } from "@/lib/graph-layout";
import { nodeTypes, type AtlasNode } from "@/components/atlas/graph/ConceptNode";
import { edgeAppearance } from "@/components/atlas/graph/edge-style";
import { GraphToolbar } from "@/components/atlas/graph/GraphToolbar";
import { GraphFiltersPanel } from "@/components/atlas/graph/GraphFiltersPanel";
import { ConceptDetailPanel } from "@/components/atlas/graph/ConceptDetailPanel";
import { RelationshipInspector } from "@/components/atlas/graph/RelationshipInspector";
import { Breadcrumbs } from "@/components/atlas/graph/Breadcrumbs";
import { ShortcutsDialog } from "@/components/atlas/graph/ShortcutsDialog";

const DEFAULT_FOCUS = "tail-latency";

function FitOnChange({ signature }: { signature: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const timer = window.setTimeout(() => void fitView({ duration: 500, padding: 0.16 }), 80);
    return () => window.clearTimeout(timer);
  }, [fitView, signature]);
  return null;
}

export type GraphExperienceProps = {
  /** Layers, concepts and relationships read from the database by the route loader. */
  graph: AtlasGraphPayload;
  initialFocus?: string;
  initialMode?: GraphMode;
  initialDepth?: number;
  initialLayer?: string;
};

export function GraphExperience({
  graph,
  initialFocus,
  initialMode,
  initialDepth,
  initialLayer,
}: GraphExperienceProps) {
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const flowRef = useRef<ReactFlowInstance<AtlasNode, Edge> | null>(null);
  const layoutRun = useRef(0);

  // Evidence and sources are fetched per concept, so the canvas only needs the
  // structural tables. The index turns those rows into the same lookups the
  // pure graph modules expect.
  const index = useMemo(
    () =>
      createGraphIndex({
        layers: graph.layers,
        concepts: graph.concepts,
        relationships: graph.relationships,
        evidence: [],
        sources: [],
        conceptSources: [],
      }),
    [graph],
  );
  const { getConcept, getLayer, layerName, degree, neighbors } = index;
  const { layers, concepts, relationships: allRelationships } = index.graph;
  const CONCEPTS_PER_LAYER = useMemo(
    () =>
      concepts.reduce<Record<string, number>>((counts, concept) => {
        counts[concept.layerId] = (counts[concept.layerId] ?? 0) + 1;
        return counts;
      }, {}),
    [concepts],
  );

  const startFocus = initialFocus && getConcept(initialFocus) ? initialFocus : DEFAULT_FOCUS;
  const startLayer = initialLayer && getLayer(initialLayer) ? initialLayer : undefined;
  const [selectedId, setSelectedId] = useState(startFocus);
  const [mode, setMode] = useState<GraphMode>(startLayer ? "layer" : (initialMode ?? "focus"));
  const [layerFocusId, setLayerFocusId] = useState<string | undefined>(startLayer);
  const [depth, setDepth] = useState(Math.min(Math.max(initialDepth ?? 1, 1), 3));
  const [layerIds, setLayerIds] = useState<ReadonlySet<string>>(
    () => new Set(layers.map((layer) => layer.id)),
  );
  const [relationshipTypes, setRelationshipTypes] = useState<ReadonlySet<RelationshipType>>(
    () => new Set(RELATIONSHIP_TYPES),
  );
  const [trail, setTrail] = useState<string[]>([startFocus]);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHighlight, setSearchHighlight] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [inspectedEdgeId, setInspectedEdgeId] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [neighborCursor, setNeighborCursor] = useState(0);
  const [positioned, setPositioned] = useState<PositionedConcept[]>([]);
  const [layoutPending, setLayoutPending] = useState(true);

  const selected = getConcept(selectedId) ?? getConcept(DEFAULT_FOCUS) ?? concepts[0]!;
  const selectedNeighbors = useMemo(() => neighbors(selected.id), [neighbors, selected.id]);
  // The detail panel's signals load on demand; the canvas never waits for them.
  const selectedEvidence = useQuery(conceptEvidenceQuery(selected.id));

  const syncUrl = useCallback(
    (next: {
      focus?: string | undefined;
      mode?: GraphMode | undefined;
      depth?: number | undefined;
      layer?: string | undefined;
    }) => {
      const nextMode = next.mode ?? mode;
      const nextDepth = next.depth ?? depth;
      const nextLayer = next.layer === "" ? undefined : (next.layer ?? layerFocusId);
      void navigate({
        to: "/graph",
        replace: true,
        search: {
          focus: next.focus ?? selectedId,
          ...(nextMode !== "focus" ? { mode: nextMode } : {}),
          ...(nextDepth !== 1 ? { depth: nextDepth } : {}),
          ...(nextMode === "layer" && nextLayer ? { layer: nextLayer } : {}),
        },
      });
    },
    [depth, layerFocusId, mode, navigate, selectedId],
  );

  const selectConcept = useCallback(
    (id: string) => {
      const concept = getConcept(id);
      if (!concept) return;
      setSelectedId(id);
      setTrail((current) => appendTrail(current, id));
      setNeighborCursor(0);
      setQuery("");
      setSearchOpen(false);
      setInspectedEdgeId(null);
      // Picking a concept that lives outside the open layer leaves layer mode,
      // so the canvas never contradicts the detail panel.
      if (mode === "layer" && concept.layerId !== layerFocusId) {
        setMode("focus");
        setLayerFocusId(undefined);
        syncUrl({ focus: id, mode: "focus", layer: "" });
        return;
      }
      syncUrl({ focus: id });
    },
    [layerFocusId, mode, syncUrl],
  );

  const changeMode = useCallback(
    (next: GraphMode) => {
      setMode(next);
      if (next !== "layer") setLayerFocusId(undefined);
      setInspectedEdgeId(null);
      syncUrl({ mode: next, layer: next === "layer" ? layerFocusId : "" });
    },
    [layerFocusId, syncUrl],
  );

  const changeDepth = useCallback(
    (next: number) => {
      setDepth(next);
      if (mode !== "focus") setMode("focus");
      syncUrl({ depth: next, mode: "focus" });
    },
    [mode, syncUrl],
  );

  // A link elsewhere in the app can change the URL while this view stays mounted.
  const appliedRoute = useRef(`${startFocus}|${mode}|${depth}|${startLayer ?? ""}`);
  useEffect(() => {
    const signature = `${initialFocus ?? ""}|${initialMode ?? "focus"}|${initialDepth ?? 1}|${initialLayer ?? ""}`;
    if (signature === appliedRoute.current) return;
    appliedRoute.current = signature;
    if (initialFocus && getConcept(initialFocus)) {
      setSelectedId(initialFocus);
      setTrail((current) => appendTrail(current, initialFocus));
      setNeighborCursor(0);
    }
    if (initialLayer && getLayer(initialLayer)) {
      setLayerFocusId(initialLayer);
      setMode("layer");
    } else {
      setMode(initialMode ?? "focus");
      setLayerFocusId(undefined);
    }
    setDepth(Math.min(Math.max(initialDepth ?? 1, 1), 3));
  }, [initialDepth, initialFocus, initialLayer, initialMode]);

  const view = useMemo(
    () =>
      buildGraphView(index.graph, {
        mode,
        focusId: selectedId,
        depth,
        layerFocusId,
        layerIds,
        relationshipTypes,
      }),
    [depth, index, layerFocusId, layerIds, mode, relationshipTypes, selectedId],
  );

  useEffect(() => {
    const run = ++layoutRun.current;
    setLayoutPending(true);
    void layoutGraph(view.concepts, view.relationships).then((next) => {
      if (run !== layoutRun.current) return;
      setPositioned(next);
      setLayoutPending(false);
    });
  }, [view]);

  const nodes: AtlasNode[] = useMemo(
    () =>
      positioned.map((concept) => {
        const hop = view.distance[concept.id] ?? 99;
        return {
          id: concept.id,
          type: "atlas" as const,
          position: { x: concept.x, y: concept.y },
          data: {
            concept,
            layerLabel: layerName(concept.layerId),
            connections: degree(concept.id),
            hop,
            focused: concept.id === selectedId,
            dimmed: mode === "atlas" && hop >= 2,
          },
        };
      }),
    [mode, positioned, selectedId, view.distance],
  );

  const edges: Edge[] = useMemo(
    () =>
      view.relationships.map((relationship) => {
        const appearance = edgeAppearance[relationship.type];
        const touchesSelection =
          relationship.sourceId === selectedId || relationship.targetId === selectedId;
        const inspected = relationship.id === inspectedEdgeId;
        return {
          id: relationship.id,
          source: relationship.sourceId,
          target: relationship.targetId,
          type: "smoothstep",
          className: cn(
            appearance.className,
            touchesSelection && "graph-edge-highlighted",
            inspected && "graph-edge-inspected",
          ),
          markerEnd: { type: MarkerType.ArrowClosed },
          zIndex: inspected ? 3 : touchesSelection ? 2 : 0,
          ...(mode === "focus" && view.relationships.length <= 60
            ? { label: relationship.type.replaceAll("_", " ").toLowerCase() }
            : {}),
          ...(appearance.dash ? { style: { strokeDasharray: appearance.dash } } : {}),
        };
      }),
    [inspectedEdgeId, mode, selectedId, view.relationships],
  );

  const matches = useMemo(() => rankConcepts(concepts, query, 8), [query]);

  const fitView = useCallback(() => {
    void flowRef.current?.fitView({ duration: 420, padding: 0.16 });
  }, []);

  const goBack = useCallback(() => {
    setTrail((current) => {
      if (current.length < 2) return current;
      const next = current.slice(0, -1);
      const target = next[next.length - 1];
      if (!target) return current;
      setSelectedId(target);
      setNeighborCursor(0);
      syncUrl({ focus: target });
      return next;
    });
  }, [syncUrl]);

  const openEntry = useCallback(() => {
    void navigate({ to: "/concepts/$slug", params: { slug: selected.slug } });
  }, [navigate, selected.slug]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;

      if (event.key === "?" || (event.key === "/" && event.shiftKey)) {
        event.preventDefault();
        setShortcutsOpen((open) => !open);
        return;
      }
      if (shortcutsOpen) return;

      if (event.key === "Escape") {
        if (inspectedEdgeId) setInspectedEdgeId(null);
        else if (filtersOpen) setFiltersOpen(false);
        else {
          setQuery("");
          setSearchOpen(false);
        }
        return;
      }
      if (typing) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key) {
        case "/":
          event.preventDefault();
          searchRef.current?.focus();
          break;
        case "f":
          changeMode("focus");
          break;
        case "a":
          changeMode("atlas");
          break;
        case "1":
        case "2":
        case "3":
          changeDepth(Number(event.key));
          break;
        case "l":
          setFiltersOpen((open) => !open);
          break;
        case ".":
          fitView();
          break;
        case "e":
          openEntry();
          break;
        case "Backspace":
          event.preventDefault();
          goBack();
          break;
        case "j":
        case "ArrowDown":
          if (selectedNeighbors.length === 0) break;
          event.preventDefault();
          setNeighborCursor((cursor) => (cursor + 1) % selectedNeighbors.length);
          break;
        case "k":
        case "ArrowUp":
          if (selectedNeighbors.length === 0) break;
          event.preventDefault();
          setNeighborCursor(
            (cursor) => (cursor - 1 + selectedNeighbors.length) % selectedNeighbors.length,
          );
          break;
        case "Enter": {
          const entry = selectedNeighbors[neighborCursor];
          if (entry) selectConcept(entry.other.id);
          break;
        }
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    changeDepth,
    changeMode,
    filtersOpen,
    fitView,
    goBack,
    inspectedEdgeId,
    neighborCursor,
    openEntry,
    selectConcept,
    selectedNeighbors,
    shortcutsOpen,
  ]);

  const inspected = useMemo(() => {
    if (!inspectedEdgeId) return null;
    const relationship = allRelationships.find((item) => item.id === inspectedEdgeId);
    if (!relationship) return null;
    const source = getConcept(relationship.sourceId);
    const target = getConcept(relationship.targetId);
    return source && target ? { relationship, source, target } : null;
  }, [inspectedEdgeId]);

  const trailConcepts = useMemo(
    () => trail.map((id) => getConcept(id)).filter((concept) => concept !== undefined),
    [trail],
  );

  const activeFilterCount =
    layers.length - layerIds.size + (RELATIONSHIP_TYPES.length - relationshipTypes.size);
  const signature = `${mode}-${layerFocusId ?? ""}-${depth}-${view.concepts.map((c) => c.id).join(".")}`;

  return (
    <TooltipProvider>
      <div className="flex min-h-[calc(100vh-57px)] flex-col bg-background">
        <GraphToolbar
          nodeCount={view.concepts.length}
          edgeCount={view.relationships.length}
          query={query}
          onQueryChange={setQuery}
          matches={matches}
          highlighted={searchHighlight}
          onHighlightChange={setSearchHighlight}
          onSelect={selectConcept}
          searchOpen={searchOpen}
          onSearchOpenChange={setSearchOpen}
          searchRef={searchRef}
          layerLabelOf={layerName}
          mode={mode}
          onModeChange={changeMode}
          depth={depth}
          onDepthChange={changeDepth}
          {...(layerFocusId ? { layerLabel: layerName(layerFocusId) } : {})}
          onExitLayer={() => changeMode("focus")}
          filtersOpen={filtersOpen}
          onToggleFilters={() => setFiltersOpen((open) => !open)}
          activeFilterCount={activeFilterCount}
          onFit={fitView}
          onShortcuts={() => setShortcutsOpen(true)}
        />

        <div className="atlas-canvas relative flex-1 overflow-hidden">
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onInit={(instance) => {
                flowRef.current = instance;
              }}
              onNodeClick={(_, node) => selectConcept(node.id)}
              onNodeDoubleClick={(_, node) => {
                const concept = getConcept(node.id);
                if (concept) void navigate({ to: "/concepts/$slug", params: { slug: concept.slug } });
              }}
              onEdgeClick={(_, edge) => setInspectedEdgeId(edge.id)}
              onPaneClick={() => {
                setInspectedEdgeId(null);
                setSearchOpen(false);
              }}
              nodesDraggable
              nodesConnectable={false}
              elementsSelectable
              minZoom={0.1}
              maxZoom={2}
              fitView
              fitViewOptions={{ padding: 0.16 }}
              proOptions={{ hideAttribution: true }}
              className="atlas-flow"
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1} className="atlas-background" />
              <Controls position="bottom-left" showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                position="bottom-right"
                nodeClassName={(node) => {
                  const concept = getConcept(node.id);
                  return concept ? `minimap-node layer-${concept.layerId}` : "minimap-node";
                }}
                maskColor="var(--graph-minimap-mask)"
                className="atlas-minimap"
              />
              <FitOnChange signature={signature} />
            </ReactFlow>
          </ReactFlowProvider>

          {layoutPending && (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-background/60 backdrop-blur-sm">
              <div className="font-mono text-xs uppercase text-muted-foreground">Mapping dependencies…</div>
            </div>
          )}

          {!filtersOpen && <Breadcrumbs trail={trailConcepts} onSelect={selectConcept} onBack={goBack} />}

          {filtersOpen && (
            <GraphFiltersPanel
              layers={layers}
              conceptCountByLayer={CONCEPTS_PER_LAYER}
              layerIds={layerIds}
              relationshipTypes={relationshipTypes}
              onToggleLayer={(id) =>
                setLayerIds((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              onToggleRelationship={(type) =>
                setRelationshipTypes((current) => {
                  const next = new Set(current);
                  if (next.has(type)) next.delete(type);
                  else next.add(type);
                  return next;
                })
              }
              onAllLayers={() => setLayerIds(new Set(layers.map((layer) => layer.id)))}
              onAllRelationships={() => setRelationshipTypes(new Set(RELATIONSHIP_TYPES))}
              onOnlyLayer={(id) => {
                setLayerFocusId(id);
                setMode("layer");
                setLayerIds(new Set(layers.map((layer) => layer.id)));
                setFiltersOpen(false);
                syncUrl({ mode: "layer", layer: id });
              }}
              onClose={() => setFiltersOpen(false)}
            />
          )}

          <ConceptDetailPanel
            concept={selected}
            layerLabel={layerName(selected.layerId)}
            neighbors={selectedNeighbors}
            evidence={selectedEvidence.data ?? []}
            evidencePending={selectedEvidence.isPending}
            cursor={neighborCursor}
            onCursorChange={setNeighborCursor}
            onSelect={selectConcept}
            onInspect={setInspectedEdgeId}
            onFocusHere={() => {
              changeMode("focus");
              fitView();
            }}
          />

          {inspected && (
            <RelationshipInspector
              relationship={inspected.relationship}
              source={inspected.source}
              target={inspected.target}
              onSelect={(id) => selectConcept(id)}
              onClose={() => setInspectedEdgeId(null)}
            />
          )}
        </div>
      </div>
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </TooltipProvider>
  );
}
