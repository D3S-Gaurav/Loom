"use client";

import { useSwarm } from "@/lib/store";
import { ArrowLeftIcon } from "./ui/Icons";

export function NewSwarmButton() {
  const runStatus = useSwarm((state) => state.runStatus);
  const goHome = useSwarm((state) => state.goHome);
  const running = runStatus === "running";

  if (runStatus === "idle") return null;

  return (
    <button
      className="loom-icon-link loom-new-swarm"
      type="button"
      disabled={running}
      title={running ? "Wait for the active swarm to finish" : "Return to the Home composer"}
      onClick={() => {
        goHome();
        window.requestAnimationFrame(() => {
          document.querySelector<HTMLTextAreaElement>('[aria-label="Swarm goal"]')?.focus();
        });
      }}
    >
      <ArrowLeftIcon size={16} />
      <span>Back to Home</span>
    </button>
  );
}
