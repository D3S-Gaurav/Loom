"use client";

import { useCallback, useEffect, useState } from "react";
import { useSwarm } from "@/lib/store";
import { deleteRun, listRuns, seedOnce, type SavedRun } from "@/lib/history";
import { SAMPLE_RUN } from "@/lib/sampleRun";
import { ClockIcon, LayersIcon, TrashIcon } from "./ui/Icons";

function ago(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function RecentRuns() {
  const [runs, setRuns] = useState<SavedRun[]>(() => {
    seedOnce(SAMPLE_RUN);
    return listRuns();
  });
  const loadRun = useSwarm((s) => s.loadRun);
  const runStatus = useSwarm((s) => s.runStatus);
  const runId = useSwarm((s) => s.runId);

  const refresh = useCallback(() => setRuns(listRuns()), []);

  // Refresh the list whenever a run finishes (it just got persisted).
  useEffect(() => {
    if (runStatus !== "done") return;
    const id = window.setTimeout(refresh, 0);
    return () => window.clearTimeout(id);
  }, [runStatus, refresh]);

  return (
    <aside className="loom-runs">
      <div className="loom-runs-head">
        <span><ClockIcon size={15} />Recent runs</span>
        <span className="loom-runs-count">{runs.length}</span>
      </div>
      <ul className="loom-runs-list">
        {runs.length === 0 && <li className="loom-runs-empty">No runs yet. Deploy a swarm →</li>}
        {runs.map((r) => {
          const active = runStatus === "done" && r.id === runId;
          const workers = r.agents.filter(
            (a) => a.agentType !== "planner" && a.agentType !== "validator",
          ).length;
          return (
            <li key={r.id} className={`loom-run-item${active ? " is-active" : ""}`}>
              <button className="loom-run-main" onClick={() => loadRun(r)} title={r.goal}>
                <span className="loom-run-goal">{r.goal}</span>
                <span className="loom-run-meta">
                  <ClockIcon size={12} />{ago(r.at)}
                  <LayersIcon size={12} />{workers} agents
                  {r.stats ? <span>{(r.stats.ms / 1000).toFixed(0)}s</span> : null}
                </span>
              </button>
              <button
                aria-label={`Delete run: ${r.goal}`}
                className="loom-run-del"
                title="Delete run"
                onClick={() => {
                  deleteRun(r.id);
                  refresh();
                }}
              >
                <TrashIcon size={14} />
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
