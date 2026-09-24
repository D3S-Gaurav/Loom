"use client";

import { Handle, Position, type NodeProps } from "reactflow";
import { AGENT_META, type AgentStatus, type AgentType } from "@/lib/swarm/types";
import type { CSSProperties } from "react";
import { AgentIcon } from "./ui/Icons";

export interface FlowNodeData {
  agentType: AgentType;
  title: string;
  status: AgentStatus;
  score?: number;
  preview: string;
  selected: boolean;
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "idle",
  thinking: "thinking",
  streaming: "working",
  validating: "in review",
  retrying: "revising",
  done: "done",
  failed: "failed",
};

const STATUS_DOT: Record<AgentStatus, string> = {
  idle: "#52525b",
  thinking: "#fbbf24",
  streaming: "#38bdf8",
  validating: "#fb7185",
  retrying: "#f59e0b",
  done: "#34d399",
  failed: "#ef4444",
};

const active = (s: AgentStatus) =>
  s === "thinking" || s === "streaming" || s === "validating" || s === "retrying";

export function AgentFlowNode({ data }: NodeProps<FlowNodeData>) {
  const meta = AGENT_META[data.agentType];
  const live = active(data.status);
  return (
    <div
      className={`loom-node${live ? " is-live" : ""}${data.selected ? " is-selected" : ""}`}
      style={{ "--agent-color": meta.color } as CSSProperties}
    >
      <Handle type="target" position={Position.Top} className="loom-handle" />
      <div className="loom-node-head">
        <span className="loom-agent-glyph">
          <AgentIcon type={data.agentType} size={16} />
        </span>
        <div className="loom-node-titles">
          <span className="loom-node-type">{meta.label}</span>
          <span className="loom-node-title">{data.title}</span>
        </div>
        {data.score != null && (
          <span className="loom-score" title="Validator score">
            {data.score}/10
          </span>
        )}
      </div>

      <div className="loom-status">
        <span
          className="loom-dot"
          style={{
            background: STATUS_DOT[data.status],
          }}
        />
        {STATUS_LABEL[data.status]}
      </div>

      {data.preview && <div className="loom-preview">{data.preview}</div>}
      <Handle type="source" position={Position.Bottom} className="loom-handle" />
    </div>
  );
}
