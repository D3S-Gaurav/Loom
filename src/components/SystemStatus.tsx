"use client";

import { useEffect, useState } from "react";
import { CheckIcon, ChevronDownIcon, RadioIcon, WarningIcon } from "./ui/Icons";

interface HealthResponse {
  status: "ready" | "degraded" | "not_ready";
  executionMode: "direct" | "temporal";
  dependencies: Record<string, { ok: boolean; required?: boolean }>;
}

export function SystemStatus() {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then(setHealth)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  // "degraded" still serves runs — only optional telemetry is missing — so the
  // header stays green and the affected row carries the caveat instead.
  const ready = health?.status === "ready" || health?.status === "degraded";
  const mode = health?.executionMode ?? "temporal";
  const dependencyLabels: Record<string, string> = {
    postgres: "PostgreSQL",
    redis: "Redis",
    kafka: "Kafka event bus",
    temporal: "Temporal",
  };

  return (
    <details className="loom-system">
      <summary title={ready ? "All required services are ready" : "Check infrastructure status"}>
        <span className={`loom-system-dot${ready ? " is-ready" : ""}`} />
        <span>{health ? (ready ? "Systems ready" : "Limited mode") : "Checking systems"}</span>
        <ChevronDownIcon size={14} />
      </summary>
      <div className="loom-popover loom-system-popover">
        <div className="loom-popover-head">
          <span><RadioIcon size={15} />Infrastructure</span>
          <strong>{mode === "temporal" ? "Durable" : "Direct"}</strong>
        </div>
        <ul>
          {health ? Object.entries(health.dependencies).map(([key, dependency]) => (
            <li key={key}>
              {dependency.ok ? <CheckIcon size={15} /> : <WarningIcon size={15} />}
              <span>{dependencyLabels[key] ?? key}</span>
              <small>
                {dependency.ok
                  ? "Ready"
                  : dependency.required === false
                    ? "Degraded"
                    : "Unavailable"}
              </small>
            </li>
          )) : <li><span className="loom-button-loader" />Checking dependencies…</li>}
        </ul>
      </div>
    </details>
  );
}
