"use client";

import { useEffect, useRef } from "react";
import { animate } from "animejs/animation";
import { createScope } from "animejs/scope";
import { stagger } from "animejs/utils";
import { AgentIcon } from "./ui/Icons";

const EDGES = [
  "M320 64 C280 75 200 80 84 88",
  "M320 64 C360 75 440 80 556 88",
  "M84 152 C150 158 230 164 320 168",
  "M556 152 C490 158 410 164 320 168",
] as const;

export function AuthSwarmGraph() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let scope: ReturnType<typeof createScope> | undefined;

    function syncMotion() {
      scope?.revert();
      scope = undefined;
      if (motionPreference.matches) return;

      scope = createScope({ root }).add(() => {
        animate(".loom-auth-edge-path", {
          strokeDashoffset: -26,
          delay: stagger(140),
          duration: 1400,
          ease: "linear",
          loop: true,
        });

        animate(".loom-auth-status.is-live", {
          opacity: 1,
          scale: 1.28,
          delay: stagger(220),
          duration: 760,
          ease: "inOut(3)",
          alternate: true,
          loop: true,
        });
      });
    }

    syncMotion();
    motionPreference.addEventListener("change", syncMotion);

    return () => {
      motionPreference.removeEventListener("change", syncMotion);
      scope?.revert();
    };
  }, []);

  return (
    <div
      ref={root}
      className="loom-auth-graph"
      role="img"
      aria-label="Example swarm flow: the planner delegates to research and analysis, then both feed synthesis."
    >
      <svg
        className="loom-auth-edges"
        viewBox="0 0 640 232"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {EDGES.map((path) => (
          <g key={path}>
            <path className="loom-auth-edge-line" d={path} />
            <path className="loom-auth-edge-path" d={path} />
          </g>
        ))}
      </svg>

      <div className="loom-auth-node is-planner">
        <AgentIcon type="planner" size={17} />
        <span>Planner</span>
        <small><i className="loom-auth-status" />Task graph ready</small>
      </div>
      <div className="loom-auth-node is-research">
        <AgentIcon type="researcher" size={17} />
        <span>Research</span>
        <small><i className="loom-auth-status is-live" />Running</small>
      </div>
      <div className="loom-auth-node is-analysis">
        <AgentIcon type="analyst" size={17} />
        <span>Analysis</span>
        <small><i className="loom-auth-status is-live" />Running</small>
      </div>
      <div className="loom-auth-node is-synthesis">
        <AgentIcon type="synthesizer" size={17} />
        <span>Synthesis</span>
        <small><i className="loom-auth-status" />Waiting on 2 agents</small>
      </div>
    </div>
  );
}
