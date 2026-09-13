"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { listRuns, seedOnce, type SavedRun } from "@/lib/history";
import { SAMPLE_RUN } from "@/lib/sampleRun";
import { useSwarm } from "@/lib/store";
import { GoalBar } from "./GoalBar";
import { AmbientRelayVideo } from "./AmbientRelayVideo";
import { QuickChat } from "./QuickChat";
import { RecentRuns } from "./RecentRuns";
import { SidePanel } from "./SidePanel";
import { SwarmGraph } from "./SwarmGraph";
import { ClockIcon, LayersIcon, SparklesIcon } from "./ui/Icons";

type WorkspaceProps = {
  userName: string;
};

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "there";
}

function greetingFor(name: string, hour: number) {
  if (hour >= 5 && hour < 12) return `Good morning, ${name}.`;
  if (hour >= 12 && hour < 17) return `Good afternoon, ${name}.`;
  if (hour >= 17 && hour < 23) return `Good evening, ${name}.`;
  return `Burning the midnight tokens, ${name}?`;
}

function ago(timestamp: number) {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function subscribeToClient() {
  return () => {};
}

export function Workspace({ userName }: WorkspaceProps) {
  const name = firstName(userName);
  const isClient = useSyncExternalStore(subscribeToClient, () => true, () => false);
  const greeting = isClient
    ? greetingFor(name, new Date().getHours())
    : `Ready when you are, ${name}.`;
  const [recent, setRecent] = useState<SavedRun[]>([]);
  const [homeMode, setHomeMode] = useState<"swarm" | "chat">("swarm");
  const runStatus = useSwarm((state) => state.runStatus);
  const loadRun = useSwarm((state) => state.loadRun);
  const showWorkspace = runStatus !== "idle";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      seedOnce(SAMPLE_RUN);
      setRecent(listRuns().slice(0, 2));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (showWorkspace) {
    return (
      <>
        <GoalBar />
        <section className="loom-stage loom-workspace-enter" aria-label="Swarm workspace">
          <RecentRuns />
          <div className="loom-graph">
            <SwarmGraph />
          </div>
          <SidePanel />
        </section>
      </>
    );
  }

  return (
    <section className="loom-onboarding" aria-labelledby="loom-welcome-title">
      <div className="loom-onboarding-media" aria-hidden="true">
        <AmbientRelayVideo />
      </div>
      <div className="loom-onboarding-scrim" aria-hidden="true" />
      <div className="loom-onboarding-content">
        <div className="loom-welcome-copy">
          <span className="loom-welcome-signal">
            <SparklesIcon size={15} />
            {homeMode === "swarm" ? "Swarm ready" : "Direct channel ready"}
          </span>
          <h1 id="loom-welcome-title">{greeting}</h1>
          <p>
            {homeMode === "swarm"
              ? "Turn one ambitious outcome into parallel, inspected, and verified work."
              : "Get a direct answer without launching a full specialist swarm."}
          </p>
        </div>

        <div className="loom-home-mode" role="tablist" aria-label="Choose how Loom should work">
          <button
            type="button"
            role="tab"
            aria-selected={homeMode === "swarm"}
            className={homeMode === "swarm" ? "is-active" : ""}
            onClick={() => setHomeMode("swarm")}
          >
            Agent swarm
            <small>Parallel specialists</small>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={homeMode === "chat"}
            className={homeMode === "chat" ? "is-active" : ""}
            onClick={() => setHomeMode("chat")}
          >
            Quick chat
            <small>One direct answer</small>
          </button>
        </div>

        {homeMode === "swarm" ? <GoalBar mode="onboarding" /> : <QuickChat />}

        {homeMode === "swarm" && recent.length ? (
          <div className="loom-onboarding-recents" aria-label="Continue a recent run">
            <span>Continue a recent run</span>
            <div>
              {recent.map((run) => {
                const workers = run.agents.filter(
                  (agent) => agent.agentType !== "planner" && agent.agentType !== "validator",
                ).length;
                return (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => {
                      loadRun(run);
                    }}
                    title={run.goal}
                  >
                    <strong>{run.goal}</strong>
                    <small><ClockIcon size={12} />{ago(run.at)} <LayersIcon size={12} />{workers} agents</small>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
