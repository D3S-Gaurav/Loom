"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { useSwarm, type AgentNode } from "@/lib/store";
import { AgentFlowNode, type FlowNodeData } from "./AgentFlowNode";
import {
  CloseIcon,
  LayersIcon,
  MaximizeIcon,
  RadioIcon,
  SparklesIcon,
} from "./ui/Icons";

const nodeTypes = { agent: AgentFlowNode };

const COL = 300;
const ROW = 150;

/** Longest-path layering so dependencies always flow downward. */
function layout(agents: Record<string, AgentNode>): Record<string, { x: number; y: number }> {
  const depth: Record<string, number> = {};
  const get = (id: string): number => {
    if (depth[id] != null) return depth[id];
    const a = agents[id];
    if (!a) return 0;
    if (a.agentType === "planner") return (depth[id] = 0);
    if (a.agentType === "synthesizer") return (depth[id] = 0); // fixed up below
    const deps = a.dependsOn.map((d) => `agent-${d}`).filter((d) => agents[d]);
    depth[id] = deps.length ? 1 + Math.max(...deps.map(get)) : 1;
    return depth[id];
  };
  Object.keys(agents).forEach((id) => {
    if (agents[id].agentType !== "validator") get(id);
  });

  const workerDepths = Object.entries(agents)
    .filter(([, a]) => a.agentType !== "planner" && a.agentType !== "validator" && a.agentType !== "synthesizer")
    .map(([id]) => depth[id] ?? 1);
  const maxWorker = workerDepths.length ? Math.max(...workerDepths) : 1;

  Object.entries(agents).forEach(([id, a]) => {
    if (a.agentType === "synthesizer") depth[id] = maxWorker + 1;
  });

  // Bucket by depth and spread vertically, centered.
  const byDepth: Record<number, string[]> = {};
  Object.entries(agents).forEach(([id, a]) => {
    if (a.agentType === "validator") return;
    const d = depth[id] ?? 1;
    (byDepth[d] ??= []).push(id);
  });

  const pos: Record<string, { x: number; y: number }> = {};
  const maxDepth = Math.max(0, ...Object.keys(byDepth).map(Number));
  Object.entries(byDepth).forEach(([d, ids]) => {
    ids.forEach((id, i) => {
      pos[id] = { x: Number(d) * COL, y: (i - (ids.length - 1) / 2) * ROW };
    });
  });
  // Validator parked to the right, mid-graph.
  pos["validator"] = { x: (maxDepth + 1) * COL, y: -ROW };
  return pos;
}

const EDGE_COLOR: Record<string, string> = {
  assign: "#a78bfa",
  depends: "#64748b",
  review: "#fb7185",
  revise: "#f59e0b",
  result: "#c084fc",
  context: "#475569",
};

export function SwarmGraph() {
  const [isExpanded, setIsExpanded] = useState(false);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const shouldRestoreFocusRef = useRef(false);
  const agents = useSwarm((s) => s.agents);
  const edges = useSwarm((s) => s.edges);
  const selected = useSwarm((s) => s.selected);
  const select = useSwarm((s) => s.select);
  const runStatus = useSwarm((s) => s.runStatus);
  const transport = useSwarm((s) => s.transport);
  const goal = useSwarm((s) => s.goal);

  const pos = useMemo(() => layout(agents), [agents]);

  const rfNodes: Node<FlowNodeData>[] = useMemo(
    () =>
      Object.values(agents).map((a) => {
        const clean = a.output.replace(/[#*`>_-]/g, " ").replace(/\s+/g, " ").trim();
        return {
          id: a.id,
          type: "agent",
          position: pos[a.id] ?? { x: 0, y: 0 },
          data: {
            agentType: a.agentType,
            title: a.title,
            status: a.status,
            score: a.score,
            preview: clean.length > 110 ? clean.slice(-110) : clean,
            selected: selected === a.id,
          },
          draggable: true,
        };
      }),
    [agents, pos, selected],
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      edges
        .filter((e) => agents[e.source] && agents[e.target])
        .map((e) => {
          const liveTarget = ["thinking", "streaming", "validating", "retrying"].includes(
            agents[e.target]?.status,
          );
          const color = EDGE_COLOR[e.label] ?? "#475569";
          return {
            id: e.id,
            source: e.source,
            target: e.target,
            label: e.label,
            animated: liveTarget,
            style: { stroke: color, strokeWidth: liveTarget ? 2 : 1.2, opacity: 0.8 },
            labelStyle: { fill: "#aaa1b9", fontSize: 10 },
            labelBgStyle: { fill: "#0b0b14", fillOpacity: 0.7 },
            markerEnd: { type: MarkerType.ArrowClosed, color },
          };
        }),
    [edges, agents],
  );

  useEffect(() => {
    if (!isExpanded) {
      if (shouldRestoreFocusRef.current) {
        shouldRestoreFocusRef.current = false;
        expandButtonRef.current?.focus();
      }
      return;
    }

    const previousOverflow = document.body.style.overflow;
    shouldRestoreFocusRef.current = true;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isExpanded]);

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setIsExpanded(false);
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.getAttribute("aria-hidden") !== "true");
    const first = focusable[0];
    const last = focusable.at(-1);

    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const renderGraph = (expanded: boolean) => (
    <>
      <div className="loom-graph-head">
        <div className="loom-graph-heading">
          <LayersIcon size={16} />
          <span>
            <strong id={expanded ? "loom-expanded-graph-title" : undefined}>
              Execution graph
            </strong>
            <small>{goal || "Dependencies and agent handoffs appear here"}</small>
          </span>
        </div>
        <div className="loom-graph-actions">
          {runStatus === "running" ? (
            <span
              className={`loom-transport is-${transport ?? "pending"}`}
              title={
                transport === "websocket"
                  ? "Live events arrive over the telemetry WebSocket, reconciled against the durable Redis log."
                  : transport === "sse"
                    ? "Live events arrive over the SSE response from /api/swarm."
                    : "Choosing a live transport."
              }
            >
              {transport === "websocket" ? "WebSocket" : transport === "sse" ? "SSE" : "Connecting"}
            </span>
          ) : null}
          <span className={`loom-run-state is-${runStatus}`}>
            <RadioIcon size={13} />
            {runStatus === "running"
              ? "Live"
              : runStatus === "done"
                ? "Complete"
                : runStatus === "error"
                  ? "Interrupted"
                  : "Standby"}
          </span>
          {expanded ? (
            <button
              ref={closeButtonRef}
              aria-label="Close expanded execution graph"
              className="loom-graph-view-button"
              type="button"
              onClick={() => setIsExpanded(false)}
            >
              <CloseIcon size={15} />
              <span>Close</span>
              <kbd>Esc</kbd>
            </button>
          ) : (
            <button
              ref={expandButtonRef}
              aria-haspopup="dialog"
              className="loom-graph-view-button"
              type="button"
              onClick={() => setIsExpanded(true)}
            >
              <MaximizeIcon size={15} />
              <span>Expand graph</span>
            </button>
          )}
        </div>
      </div>
      <div
        aria-label="Agent execution dependency graph"
        className={`loom-graph-canvas${runStatus === "running" ? " is-live" : ""}`}
        role="region"
      >
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, n) => select(n.id)}
          onPaneClick={() => select(null)}
          fitView
          fitViewOptions={{ padding: expanded ? 0.12 : 0.25 }}
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#29233f" />
          <Controls showInteractive={false} />
        </ReactFlow>
        {rfNodes.length === 0 ? (
          <div className="loom-graph-empty">
            <span><SparklesIcon size={22} /></span>
            <h3>The graph is ready</h3>
            <p>Deploy a goal or open a recent run to inspect the swarm.</p>
          </div>
        ) : null}
      </div>
    </>
  );

  return (
    <>
      {!isExpanded ? renderGraph(false) : null}
      {isExpanded
        ? createPortal(
            <div
              aria-labelledby="loom-expanded-graph-title"
              aria-modal="true"
              className="loom-graph-overlay"
              role="dialog"
              onKeyDown={handleDialogKeyDown}
            >
              <div className="loom-graph is-expanded">{renderGraph(true)}</div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
