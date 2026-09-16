# Loom Interview Updates

## Product improvements: fewer tokens + more production-ready

If an interviewer asks “what would you improve?”, answer with tradeoffs, not vague claims.

### A. Reduce token usage

Current token-heavy parts:

- Every worker gets full dependency outputs.
- Validator reads full worker output.
- Synthesizer reads all worker outputs.
- Retries duplicate worker output generation.

Better options:

1. Dependency summarization

Instead of passing full upstream outputs, store:

```ts
{
  fullOutput,
  summary,
  keyFacts,
  citations,
  decisions
}
```

Pass only summaries to downstream tasks unless full detail is needed.

Tradeoff: cheaper, but may lose nuance.

2. Token budget per agent

Set max output tokens per role:

```text
researcher: 500
analyst: 400
writer: 600
validator: 150
synthesizer: 800
```

Tradeoff: predictable cost, but may reduce depth.

3. Conditional validation

Validate only:

- final answer
- high-risk tasks
- low-confidence outputs
- outputs above cost/complexity threshold

Tradeoff: cheaper, but less robust.

4. Use cheaper models for simpler roles

Example:

- planner: strong model
- worker: cheaper model
- validator: cheap fast model or rules first
- synthesizer: strong model

Tradeoff: cost reduction, but quality can vary.

5. Cache repeat tasks

If the same goal/task appears again, reuse the previous result.

Tradeoff: requires cache invalidation and freshness checks.

6. Compress blackboard

Before downstream tasks, run a cheap compression step:

```text
Extract only:
- facts
- decisions
- constraints
- unresolved questions
```

Tradeoff: adds one extra call but may save more later.

### B. Production readiness

Current system is good demo architecture, but not fully production-hardened.

Improve:

1. Durable run storage

Current events are in-memory. Add database tables:

```text
runs
tasks
events
outputs
validation_results
```

Benefit: resume runs, debug failures, show history across devices.

2. Real job queue

Move long swarm execution to a background worker:

```text
API request → create run → queue job → stream events
```

Use Redis/BullMQ, Cloud Tasks, Temporal, or Inngest.

Benefit: better reliability than doing everything inside request lifecycle.

3. Cancellation support

Currently the client can abort fetch, but the backend may continue model work. Add abort propagation to model calls.

Benefit: saves tokens when the user stops a run.

4. Rate limits and auth

Add:

- per-user rate limits
- daily token budget
- authentication
- abuse protection
- goal length limits

Benefit: prevents runaway cost.

5. Better dependency validation

Planner can produce invalid dependencies. Add code checks:

- dependency IDs must exist
- no self-dependency
- no cycles
- max depth
- max fanout
- all tasks reachable

Benefit: safer orchestration.

6. Observability

Add structured logs:

```text
run_id
task_id
model
latency
tokens_in
tokens_out
cost
retry_count
validation_score
```

Benefit: can debug quality, latency, and cost.

7. Better fallback policy

Instead of auto-approving validator failures, mark output as unvalidated.

Benefit: more honest reliability.

8. Idempotency

If the client retries a request, avoid duplicate expensive runs. Use a request ID or run ID.

Benefit: cost control.

9. Streaming protocol version

Add event versioning:

```ts
{ version: 1, kind: "agent.token", ... }
```

Benefit: frontend/backend compatibility as product evolves.

10. Prompt injection defense

Workers may consume upstream text. Add rules to treat upstream outputs as data, not instructions.

Benefit: safer multi-agent behavior.

Strong interview answer:

> To make this production-ready, I would separate orchestration from the request lifecycle, persist run/task/event state, add user-level rate limits and token budgets, validate planner DAGs in code, support cancellation, and improve observability around latency, tokens, cost, retries, and validation scores. For token reduction, I would summarize blackboard context, cap role outputs, use conditional validation, cache repeated subtasks, and route simple tasks to cheaper models.

## Medium interview questions with answers

### Q1. Why use a DAG instead of a simple task list?

A simple list forces serial execution. A DAG captures dependencies, so independent tasks can run in parallel while dependent tasks wait for required context. This improves latency and makes orchestration more accurate because the system knows which outputs are needed before starting each task.

### Q2. How does the orchestrator know which tasks can run?

It keeps two maps: `remaining` and `completed`. A task is ready when every ID in `task.dependsOn` exists in `completed`. The scheduler repeatedly finds ready tasks and runs them as a wave using `Promise.all`.

### Q3. What is the shared blackboard?

The shared blackboard is the `completed` map. It stores outputs from finished tasks. When a downstream task starts, the orchestrator reads outputs from its dependencies and passes them into the worker prompt as context.

### Q4. Why use Zod in the planner and validator?

Because LLMs can return malformed or unstructured text. Zod enforces runtime schemas, so planner output becomes a valid task graph and validator output becomes a known verdict shape. This reduces orchestration errors.

### Q5. Why stream events instead of waiting for the final answer?

Streaming improves perceived latency and observability. The user sees agents spawning, producing tokens, being validated, and finishing. It also makes debugging easier because each intermediate event is visible.

## Hard interview questions with answers

### Q1. What happens if the planner creates a dependency cycle?

The orchestrator detects it indirectly. If tasks remain but no task is ready, then dependencies cannot be satisfied. The code emits an error: “Plan has an unsatisfiable dependency cycle.” A stronger production version would validate the DAG immediately after planning using explicit cycle detection before execution begins.

### Q2. Is `Promise.all` always safe here?

It is safe for independent wave tasks because their dependencies are already completed. But there are production concerns. If one promise rejects, `Promise.all` normally rejects; this implementation catches errors inside each task, marks that task failed, and stores a fallback output so dependents can proceed. The tradeoff is resilience over strict correctness.

### Q3. What is the risk of passing full upstream outputs into downstream workers?

It increases token usage and latency. It can also introduce prompt injection risk if upstream content contains malicious instructions. A better design would pass structured summaries or sanitized facts, and treat upstream outputs as untrusted data.

### Q4. Why is auto-approving validator failure risky?

It keeps the run alive during model outages, but it hides quality uncertainty. Bad outputs may pass into synthesis. A better production behavior is to mark the task as `unvalidated`, retry with a backup validator, or lower confidence in the final response.

### Q5. Is the EventBus production durable?

No. It is an in-memory queue. It is fine for a hackathon demo or single request lifecycle, but events disappear if the server crashes. Production should persist events to Redis Streams, Kafka, a database event log, or a workflow system.

### Q6. How would you support resume/reconnect?

Assign every run a `runId` and every event a monotonically increasing sequence number. Persist events. When the client reconnects, it sends the last received event ID, and the server replays missed events before continuing the live stream.

### Q7. How would you reduce latency?

Maximize DAG parallelism, cap model output sizes, stream immediately, use faster models for low-risk roles, avoid unnecessary validation, compress dependency context, and begin synthesis incrementally when possible. Also move orchestration to workers so HTTP handling remains lightweight.

### Q8. How would you test this system?

Unit test DAG scheduling with fake plans, including parallel waves, cycles, missing dependencies, and failed tasks. Mock model calls for planner/worker/validator. Test event order invariants, like `agent.spawn` before `agent.token`. Integration test the SSE route by reading streamed frames and verifying frontend state transitions.

## Senior-level explain-your-project answer

> Loom is a Next.js and TypeScript agent-swarm orchestrator. The backend receives a user goal through a Next.js route handler. A planner model creates a schema-validated DAG of 2–4 specialist tasks. The orchestrator executes the DAG in dependency waves: tasks whose dependencies are complete run concurrently with `Promise.all`. Completed task outputs are stored in a shared blackboard and passed into downstream workers. Each worker is role-specialized through system prompts and streams token events through an in-memory EventBus. A validator model checks each worker output using structured output and can trigger one feedback-based retry. After all tasks complete, a synthesizer combines the approved outputs into the final deliverable. The frontend consumes Server-Sent Events, reduces typed events into Zustand state, and renders the live graph with React Flow.

## Best product-improvement answer for interview

> The current version is strong for a live demo because it prioritizes visibility and self-correction. To make it production-ready, I would improve four areas: durability, cost control, safety, and observability. Durability means persisting runs, tasks, outputs, and event logs instead of relying on in-memory state. Cost control means summarizing blackboard context, enforcing token budgets, using cheaper models for simple roles, caching repeated subtasks, and validating conditionally. Safety means validating planner DAGs, preventing prompt injection through upstream outputs, supporting cancellation, and adding user-level rate limits. Observability means tracking latency, token usage, cost, retry count, model choice, and validation scores per task.

## If building Loom from zero, what to write first

Build from the contract outward. Do not start with UI animation first.

### Step 1: Create the app shell

```bash
pnpm create next-app loom --ts --app
cd loom
pnpm add ai zod zustand reactflow react-markdown remark-gfm @openrouter/ai-sdk-provider
```

Why first: Next.js and TypeScript create the frontend/backend structure. Zod and AI SDK are needed for structured LLM calls. Zustand and React Flow are for the live UI.

### Step 2: Create the swarm folder

```text
src/lib/swarm/
  types.ts
  bus.ts
  models.ts
  run.ts
  planner.ts
  worker.ts
  validator.ts
  orchestrator.ts
```

Why first: the swarm is the product core. The UI should consume stable typed events, not invent its own state shape.

### Step 3: Write `types.ts`

Define:

- `AgentType`
- `AgentStatus`
- `SwarmTask`
- `SwarmPlan`
- `SwarmEvent`

Why: this becomes the shared contract between backend orchestration and frontend rendering.

### Step 4: Write `bus.ts`

Create an `EventBus` async queue.

Why: parallel workers need to emit many events, but the HTTP response needs one ordered stream.

### Step 5: Write model wrappers in `models.ts` and `run.ts`

Create small helpers:

- `runText(...)`
- `genObject(...)`

Why: planner and validator need structured object output; workers and synthesizer need streamed text output.

### Step 6: Write `planner.ts`

Create a Zod schema for the plan and call the planner model.

Why: without a valid DAG, orchestration cannot run safely.

### Step 7: Write `worker.ts`

Run one task using role-specific prompts and stream token deltas.

Why: this proves one agent can execute one task.

### Step 8: Write `validator.ts`

Validate worker output using score, approval, and feedback.

Why: this adds the self-correction loop.

### Step 9: Write `orchestrator.ts`

Implement:

- `completed` blackboard
- `remaining` tasks
- `ready()` scheduler
- `Promise.all` wave execution
- validator retry loop
- synthesis pass

Why: this is where the swarm behavior actually exists.

### Step 10: Write `/api/swarm/route.ts`

Accept the user goal, start `runSwarm`, and stream events as SSE.

Why: this exposes the swarm to the frontend without leaking API keys.

### Step 11: Write frontend store

Create `src/lib/store.ts` with:

- `reset(goal)`
- `apply(event)`
- agents
- edges
- final answer
- selected node

Why: frontend should be a pure projection of backend events.

### Step 12: Write `useRunSwarm.ts`

Use `fetch("/api/swarm")`, read streamed chunks, parse SSE frames, and call `apply(event)`.

Why: this connects backend streaming to client state.

### Step 13: Build the UI

Add:

- `GoalBar`
- `SwarmGraph`
- `AgentFlowNode`
- `SidePanel`
- `RecentRuns`

Why: UI comes last because it depends on stable events and state.

### Step 14: Add production hardening

Add:

- DAG validation
- run IDs
- persisted events
- cancellation
- auth/rate limits
- token budgets
- structured logs
- fallback policies

Why: these are not demo features; they are production features.

## Build-from-zero interview answer

> If I were building this from scratch, I would start with the domain contract, not the UI. First I would define the TypeScript types for tasks, plans, agents, and stream events. Then I would create the swarm folder with an EventBus, model wrappers, planner, worker, validator, and orchestrator. After the backend can produce typed events, I would expose it through a Next.js route handler using Server-Sent Events. Only then would I build the Zustand store and React Flow UI, because the UI should be driven by backend events rather than hardcoded assumptions.
