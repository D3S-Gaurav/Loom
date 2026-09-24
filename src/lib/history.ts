import type { AgentNode, SwarmEdge } from "./store";

export interface SavedRun {
  id: string;
  goal: string;
  at: number;
  summary: string;
  agents: AgentNode[];
  edges: SwarmEdge[];
  final: string;
  stats: { tokensIn: number; tokensOut: number; ms: number } | null;
}

const KEY = "loom.runs.v1";
const SEED_FLAG = "loom.seeded.v1";
const MAX = 25;

function read(): SavedRun[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as SavedRun[];
  } catch {
    return [];
  }
}

function write(runs: SavedRun[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(runs.slice(0, MAX)));
  } catch {
    // storage full / unavailable — drop the oldest and retry once
    try {
      localStorage.setItem(KEY, JSON.stringify(runs.slice(0, 10)));
    } catch {}
  }
}

export function listRuns(): SavedRun[] {
  return read().sort((a, b) => b.at - a.at);
}

export function saveRun(run: SavedRun) {
  const runs = read().filter((r) => r.id !== run.id);
  runs.unshift(run);
  write(runs);
}

export function deleteRun(id: string) {
  write(read().filter((r) => r.id !== id));
}

/** Seed the bundled example run once, so Recent Runs is never empty on first visit. */
export function seedOnce(sample: SavedRun) {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(SEED_FLAG)) return;
  const runs = read();
  if (!runs.some((r) => r.id === sample.id)) {
    runs.push(sample);
    write(runs);
  }
  localStorage.setItem(SEED_FLAG, "1");
}
