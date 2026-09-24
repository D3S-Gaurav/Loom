import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export type Role = "planner" | "validator" | "worker" | "synthesizer" | "vision";

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
export const model = (id: string) => openrouter(id);

// Preferred paid model — auto-used the moment the OpenRouter key has credit.
const CLAUDE = process.env.LOOM_CLAUDE_MODEL ?? "anthropic/claude-sonnet-4.5";

// Free fallback pools (verified live on OpenRouter). Order = preference; the executor
// walks the list on rate-limit / unavailability so a single 429 never kills a run.
const FREE_STRUCTURED = [
  "nvidia/nemotron-nano-9b-v2:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-4-31b-it:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
];
const FREE_CHAT = [
  "openai/gpt-oss-120b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-4-31b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];
const FREE_VISION = [
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-nano-12b-v2-vl:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
];

const ENV_OVERRIDE: Record<Role, string | undefined> = {
  planner: process.env.LOOM_PLANNER_MODEL,
  validator: process.env.LOOM_VALIDATOR_MODEL,
  worker: process.env.LOOM_WORKER_MODEL,
  synthesizer: process.env.LOOM_SYNTH_MODEL,
  vision: process.env.LOOM_VISION_MODEL,
};

// Cached probe: does this key have paid access? A SUCCESSFUL result (true or
// false) is cached for the process lifetime. A probe FAILURE (network error,
// bad response) is not cached, so a transient blip doesn't permanently pin
// this process to the free-only chain for its entire lifetime.
let paidProbe: Promise<boolean> | null = null;
function hasPaidAccess(): Promise<boolean> {
  if (process.env.LOOM_FORCE_PAID === "1") return Promise.resolve(true);
  if (process.env.LOOM_FORCE_FREE === "1") return Promise.resolve(false);
  if (!paidProbe) {
    paidProbe = fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    })
      .then((r) => r.json())
      .then((j) => j?.data?.is_free_tier === false)
      .catch((error) => {
        paidProbe = null; // let the next call retry instead of caching a failure
        console.error("Paid-access probe failed; treating as free tier for this call", error);
        return false;
      });
  }
  return paidProbe;
}

/** Ordered list of model ids to try for a role. Claude first when the key is paid. */
export async function chainFor(role: Role): Promise<string[]> {
  const paid = await hasPaidAccess();
  const pool = role === "vision"
    ? FREE_VISION
    : role === "worker" || role === "synthesizer"
      ? FREE_CHAT
      : FREE_STRUCTURED;
  // Workers stay free even on a paid key (cost control); other roles prefer Claude.
  const head = [ENV_OVERRIDE[role], paid && role !== "worker" ? CLAUDE : undefined].filter(
    Boolean,
  ) as string[];
  return [...new Set([...head, ...pool])];
}
