import type { SwarmMode } from "./types";

export const CONTEXT_TRUNCATION_MARKER = "\n[… truncated by Loom's context budget …]\n";

export interface SwarmContextBudget {
  dependencyChars: number;
  revisionChars: number;
  validationChars: number;
  synthesisChars: number;
}

const CONTEXT_BUDGETS: Record<SwarmMode, SwarmContextBudget> = {
  low: {
    dependencyChars: 4_000,
    revisionChars: 1_000,
    validationChars: 8_000,
    synthesisChars: 12_000,
  },
  auto: {
    dependencyChars: 8_000,
    revisionChars: 2_000,
    validationChars: 12_000,
    synthesisChars: 24_000,
  },
  max: {
    dependencyChars: 16_000,
    revisionChars: 4_000,
    validationChars: 24_000,
    synthesisChars: 48_000,
  },
};

export function contextBudgetFor(mode: SwarmMode): SwarmContextBudget {
  return CONTEXT_BUDGETS[mode];
}

/** Provider-agnostic UI estimate, not a tokenizer or billing measurement. */
export function approximateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Keeps the useful opening and conclusion while enforcing a deterministic cap. */
export function boundContext(text: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  if (maxChars <= CONTEXT_TRUNCATION_MARKER.length) {
    return CONTEXT_TRUNCATION_MARKER.slice(0, maxChars);
  }

  const contentChars = maxChars - CONTEXT_TRUNCATION_MARKER.length;
  const headChars = Math.ceil(contentChars / 2);
  const tailChars = contentChars - headChars;
  const tail = tailChars ? text.slice(-tailChars) : "";
  return `${text.slice(0, headChars)}${CONTEXT_TRUNCATION_MARKER}${tail}`;
}

/**
 * Shares one context budget across labeled sections. Short sections remain
 * complete; longer sections split the remainder fairly and keep their labels.
 */
export function boundContextSections(
  sections: { heading: string; body: string }[],
  maxChars: number,
): string {
  if (!sections.length || maxChars <= 0) return "";

  const rendered = sections.map(({ heading, body }) => `${heading}\n${body}`);
  const separatorChars = Math.max(0, rendered.length - 1) * 2;
  const availableChars = Math.max(0, maxChars - separatorChars);
  const allocations = fairAllocations(
    rendered.map((section) => section.length),
    availableChars,
  );

  return rendered
    .map((section, index) => boundContext(section, allocations[index]))
    .join("\n\n")
    .slice(0, maxChars);
}

function fairAllocations(lengths: number[], total: number): number[] {
  const allocations = lengths.map(() => 0);
  const pending = new Set(lengths.map((_, index) => index));
  let remaining = total;

  while (pending.size && remaining > 0) {
    const share = Math.floor(remaining / pending.size);
    const complete = [...pending].filter((index) => lengths[index] <= share);
    if (complete.length) {
      for (const index of complete) {
        allocations[index] = lengths[index];
        remaining -= lengths[index];
        pending.delete(index);
      }
      continue;
    }

    const remainder = remaining % pending.size;
    for (const [position, index] of [...pending].entries()) {
      allocations[index] = share + (position < remainder ? 1 : 0);
    }
    break;
  }

  return allocations;
}
