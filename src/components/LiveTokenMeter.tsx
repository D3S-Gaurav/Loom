"use client";

import { useSwarm } from "@/lib/store";
import { RadioIcon } from "./ui/Icons";

function compactCount(value: number) {
  if (value < 1_000) return String(value);
  if (value < 10_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${Math.round(value / 1_000)}k`;
}

export function LiveTokenMeter() {
  const { agents, final, goal, planThinking, runStatus, stats } = useSwarm();
  if (runStatus === "idle") return null;

  const visibleCharacters = [
    goal,
    planThinking,
    final,
    ...Object.values(agents).map((agent) => agent.output),
  ].reduce((total, value) => total + value.length, 0);
  const tokens = stats ? stats.tokensIn + stats.tokensOut : Math.ceil(visibleCharacters / 4);
  const live = runStatus === "running";

  return (
    <div
      className={`loom-token-meter${live ? " is-live" : ""}`}
      aria-label={`${tokens.toLocaleString()} approximate tokens${live ? " used so far" : " used"}`}
    >
      <RadioIcon size={14} />
      <span>{compactCount(tokens)}</span>
      <small>{live ? "tokens live" : "tokens"}</small>
    </div>
  );
}
