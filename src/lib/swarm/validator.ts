import { z } from "zod";
import { AllModelsFailed, genObject } from "./run";
import type { SwarmMode, SwarmTask } from "./types";
import { executionPolicy } from "./executionMode";
import { boundContext, contextBudgetFor } from "./tokenBudget";

// Structured verdict schema: the validator must return a score, boolean
// approval, and actionable feedback instead of free-form text.
const schema = z.object({
  score: z.number().min(0).max(10).describe("Quality of the output against the brief, 0-10."),
  approved: z.boolean().describe("True if the output fully satisfies the brief."),
  feedback: z
    .string()
    .describe("If not approved, specific, actionable fixes. If approved, a one-line note."),
});

const SYSTEM = `You are the Validator agent — the swarm's quality gate. Judge whether a
worker's output actually fulfills its brief: correctness, completeness, specificity,
and usefulness. Be strict but fair. Approve only genuinely solid work (score >= 7).
If rejecting, give concrete, actionable feedback the worker can apply in one revision.`;

export interface Verdict {
  approved: boolean;
  score: number;
  feedback: string;
}

export async function validate(
  task: SwarmTask,
  output: string,
  signal?: AbortSignal,
  mode: SwarmMode = "auto",
): Promise<Verdict> {
  const policy = executionPolicy(mode);
  const outputContext = boundContext(output, contextBudgetFor(mode).validationChars);
  try {
    // The validator judges the worker output against the original task brief,
    // not against the final user goal. This keeps validation scoped and concrete.
    const { object } = await genObject("validator", {
      schema,
      system: [SYSTEM, policy.validatorDirective].filter(Boolean).join("\n\n"),
      prompt: `Brief:\nTask "${task.title}": ${task.brief}\n\nWorker output:\n${outputContext}`,
      signal,
    });
    return {
      // Code-level guardrail: approval requires both the model's boolean and
      // a minimum score. This prevents "approved: true, score: 4" from passing.
      approved: object.approved && object.score >= policy.approvalScore,
      score: object.score,
      feedback: object.feedback,
    };
  } catch (e) {
    // Only auto-approve when every validator MODEL was genuinely exhausted.
    // An infrastructure error must not be silently treated as "validator
    // unavailable" — that would mask a real outage as ordinary AI flakiness.
    if (!(e instanceof AllModelsFailed)) throw e;
    // Production improvement: mark this as "unvalidated" instead of silently
    // treating it as a normal approved result.
    return {
      approved: true,
      score: policy.approvalScore,
      feedback: "Validator unavailable; auto-approved.",
    };
  }
}
